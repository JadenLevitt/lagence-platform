/**
 * L'AGENCE Platform - Chat Server
 *
 * Unified API server with multi-agent routing.
 * Each agent has its own context, capabilities, and personality.
 *
 * Run with: doppler run -- node core/chat-server.js
 */

const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { loadAllAgents, buildAgentSystemPrompt, getAgent } = require('./agent-loader');
const { classifyRequest, createCapabilityPR, createPlanProposal } = require('./github-pr-service');

const anthropic = new Anthropic();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

      // Get response from Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: body.messages
      });

      const assistantMessage = response.content[0].text;

      // Handle actions based on classification and user confirmation
      let actionTaken = null;

      if (body.confirm_change && classification.can_auto_pr) {
        // User confirmed a low/medium complexity change - create PR
        log(`Creating PR for change: ${classification.change_description}`);
        const pr = await createCapabilityPR(classification, agentId);
        if (pr.success) {
          actionTaken = {
            type: 'pr_created',
            pr_url: pr.pr_url,
            pr_number: pr.pr_number
          };
        } else {
          actionTaken = {
            type: 'pr_failed',
            error: pr.error
          };
        }
      } else if (body.approve_plan && classification.requires_plan_approval) {
        // User approved a high complexity plan
        log(`Creating proposal: ${classification.change_description}`);
        const proposal = await createPlanProposal({
          title: classification.change_description,
          description: assistantMessage,
          changes: {
            files: classification.affected_files,
            complexity: classification.complexity
          }
        }, agentId);
        if (proposal.success) {
          actionTaken = {
            type: 'plan_saved',
            proposal_id: proposal.proposal_id
          };
        }
      }

      // Log feature requests to Supabase
      if (classification.request_type !== 'question') {
        await supabase.from('feature_requests').insert({
          agent_id: agentId,
          conversation: body.messages,
          assistant_response: assistantMessage,
          classification: classification,
          action_taken: actionTaken,
          status: actionTaken ? 'in_progress' : 'new'
        }).catch(err => log(`Failed to save feature request: ${err.message}`));
      }

      sendJSON(res, 200, {
        agent: { id: agent.id, name: agent.name },
        message: assistantMessage,
        classification: classification,
        action_taken: actionTaken
      });

    } catch (e) {
      log(`Chat error: ${e.message}`);
      sendJSON(res, 500, { error: e.message });
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
