/**
 * L'AGENCE Platform - Chat Server
 *
 * Unified API server with multi-agent routing.
 * Each agent has its own context, capabilities, and personality.
 *
 * Run with: doppler run -- node core/chat-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { loadAllAgents, buildAgentSystemPrompt } = require('./agent-loader');
const { classifyRequest } = require('./github-pr-service');
const { getAllFieldDefinitions } = require('../agents/ecommerce/capabilities/tech-pack-extraction/extraction-config');

const anthropic = new Anthropic();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Email notification for capability change requests
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL; // Set in Doppler

async function sendCapabilityChangeNotification({ agentId, classification, userMessage }) {
  log(`Capability change request: ${classification.request_type} for ${agentId}`);
  log(`  Description: ${classification.change_description}`);

  // Save to capability_proposals table
  const { data, error } = await supabase
    .from('capability_proposals')
    .insert({
      agent_id: agentId,
      title: classification.change_description,
      description: userMessage,
      complexity: classification.complexity,
      status: 'pending_approval',
      proposed_changes: {
        request_type: classification.request_type,
        affected_files: classification.affected_files,
        matched_capability: classification.matched_capability_id
      }
    })
    .select()
    .single();

  if (error) {
    log(`Failed to save capability proposal: ${error.message}`);
    return { success: false, error: error.message };
  }

  // Send email if Resend is configured
  if (process.env.RESEND_API_KEY && NOTIFICATION_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
          to: NOTIFICATION_EMAIL,
          subject: `[${agentId}] Capability Change Request: ${classification.change_description}`,
          html: `<h2>New Capability Change Request</h2>
<p><strong>Agent:</strong> ${agentId}</p>
<p><strong>Type:</strong> ${classification.request_type}</p>
<p><strong>Complexity:</strong> ${classification.complexity}</p>
<p><strong>Description:</strong> ${classification.change_description}</p>
<p><strong>User Request:</strong> ${userMessage}</p>`
        })
      });
      log(`Email notification sent to ${NOTIFICATION_EMAIL}`);
    } catch (e) {
      log(`Email send error: ${e.message}`);
    }
  }

  return { success: true, proposalId: data.id };
}

// Rate limiting
const rateLimiter = new Map();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;

  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, []);
  }

  const requests = rateLimiter.get(ip).filter(t => t > windowStart);
  rateLimiter.set(ip, requests);

  if (requests.length >= RATE_LIMIT) {
    return false;
  }

  requests.push(now);
  return true;
}

// Clean up rate limiter periodically
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;
  for (const [ip, requests] of rateLimiter.entries()) {
    const filtered = requests.filter(t => t > windowStart);
    if (filtered.length === 0) {
      rateLimiter.delete(ip);
    } else {
      rateLimiter.set(ip, filtered);
    }
  }
}, 60000);

// Load agents on startup
let agents = loadAllAgents();
console.log(`Loaded agents: ${Object.keys(agents).join(', ') || 'none'}`);

// Reload agents periodically (for hot-reloading during development)
setInterval(() => {
  agents = loadAllAgents();
}, 30000);

function log(msg) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] ${msg}`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const clientIP = req.socket.remoteAddress;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    sendJSON(res, 200, { ok: true });
    return;
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJSON(res, 200, {
      status: 'ok',
      agents: Object.keys(agents),
      uptime: process.uptime()
    });
    return;
  }

  // List all agents
  if (req.method === 'GET' && url.pathname === '/agents') {
    sendJSON(res, 200, {
      agents: Object.values(agents).map(a => ({
        id: a.id,
        name: a.name,
        title: a.title,
        greeting: a.greeting,
        expertise: a.expertise,
        url_patterns: a.url_patterns
      }))
    });
    return;
  }

  // Get specific agent
  if (req.method === 'GET' && url.pathname.startsWith('/agents/')) {
    const agentId = url.pathname.replace('/agents/', '');
    const agent = agents[agentId];

    if (!agent) {
      sendJSON(res, 404, { error: 'Agent not found' });
      return;
    }

    sendJSON(res, 200, {
      agent: {
        id: agent.id,
        name: agent.name,
        title: agent.title,
        personality: agent.personality,
        greeting: agent.greeting,
        expertise: agent.expertise,
        capabilities: agent.capabilities.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          triggers: c.triggers
        })),
        knows_about_agents: agent.knows_about_agents
      }
    });
    return;
  }

  // Chat with agent
  if (req.method === 'POST' && url.pathname === '/chat') {
    // Rate limiting
    if (!checkRateLimit(clientIP)) {
      sendJSON(res, 429, { error: 'Rate limit exceeded. Try again in a minute.' });
      return;
    }

    try {
      const body = await parseBody(req);

      if (!body.messages || !Array.isArray(body.messages)) {
        sendJSON(res, 400, { error: 'Missing messages array' });
        return;
      }

      // Validate messages
      if (body.messages.length > 50) {
        sendJSON(res, 400, { error: 'Too many messages in conversation (max 50)' });
        return;
      }

      const agentId = body.agent_id || 'ecommerce';
      const agent = agents[agentId];

      if (!agent) {
        sendJSON(res, 400, { error: `Unknown agent: ${agentId}` });
        return;
      }

      log(`Chat request for agent: ${agent.name}`);

      // Build system prompt
      const systemPrompt = buildAgentSystemPrompt(agentId);

      // Classify the request
      const classification = await classifyRequest(
        body.messages,
        agent.capabilities,
        anthropic
      );

      log(`Classification: ${classification.request_type} (${classification.complexity})`);

      // Handle capability change requests - save for approval, don't auto-execute
      if (classification.request_type === 'capability_tweak' || classification.request_type === 'new_capability') {
        const lastUserMessage = body.messages.filter(m => m.role === 'user').pop();
        const userMessage = lastUserMessage?.content || '';

        const result = await sendCapabilityChangeNotification({
          agentId,
          classification,
          userMessage
        });

        // Return friendly response without calling Claude again
        const responseMessage = result.success
          ? `Got it! I've logged your request and sent it to the team for review. We'll follow up once it's ready.`
          : `I understood your request but ran into a small issue saving it. Mind trying again?`;

        sendJSON(res, 200, {
          agent: { id: agent.id, name: agent.name },
          message: responseMessage,
          classification: classification,
          action_taken: result.success ? { type: 'proposal_created', proposal_id: result.proposalId } : null
        });
        return;
      }

      // For regular questions, get response from Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: body.messages
      });

      const assistantMessage = response.content[0].text;

      sendJSON(res, 200, {
        agent: { id: agent.id, name: agent.name },
        message: assistantMessage,
        classification: classification,
        action_taken: null
      });

    } catch (e) {
      log(`Chat error: ${e.message}`);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // Get field definitions for tech pack extraction
  if (req.method === 'GET' && url.pathname === '/field-definitions') {
    sendJSON(res, 200, {
      capability: 'tech-pack-extraction',
      fields: getAllFieldDefinitions()
    });
    return;
  }

  // Serve chat widget JS
  if (req.method === 'GET' && url.pathname === '/chat-widget.js') {
    const widgetPath = path.join(__dirname, 'chat-widget.js');
    try {
      const content = fs.readFileSync(widgetPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(content);
    } catch (e) {
      sendJSON(res, 500, { error: 'Failed to load chat widget' });
    }
    return;
  }

  // 404 for unknown routes
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`L'AGENCE Platform running on port ${PORT}`);
  log(`Health check: http://localhost:${PORT}/health`);
  log(`Agents: http://localhost:${PORT}/agents`);
  log(`Chat: POST http://localhost:${PORT}/chat`);
});
