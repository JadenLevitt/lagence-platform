/**
 * Agent Loader - Auto-discovers agents and capabilities from folder structure
 *
 * Scans the agents/ directory for agent.json files and builds system prompts dynamically.
 * New agents are automatically discovered - no code changes needed.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '../agents');

/**
 * Load all agents from the agents/ directory
 */
function loadAllAgents() {
  const agents = {};

  if (!fs.existsSync(AGENTS_DIR)) {
    console.warn('No agents directory found');
    return agents;
  }

  for (const agentId of fs.readdirSync(AGENTS_DIR)) {
    // Skip hidden files and non-directories
    if (agentId.startsWith('.')) continue;

    const agentPath = path.join(AGENTS_DIR, agentId);
    if (!fs.statSync(agentPath).isDirectory()) continue;

    const agentJsonPath = path.join(agentPath, 'agent.json');
    if (fs.existsSync(agentJsonPath)) {
      try {
        const agent = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8'));
        agent.capabilities = loadAgentCapabilities(agentId);
        agents[agentId] = agent;
      } catch (err) {
        console.error(`Failed to load agent ${agentId}:`, err.message);
      }
    }
  }

  return agents;
}

/**
 * Load capabilities for a specific agent
 */
function loadAgentCapabilities(agentId) {
  const capDir = path.join(AGENTS_DIR, agentId, 'capabilities');
  const capabilities = [];

  if (!fs.existsSync(capDir)) {
    return capabilities;
  }

  for (const capId of fs.readdirSync(capDir)) {
    if (capId.startsWith('.')) continue;

    const capPath = path.join(capDir, capId);
    if (!fs.statSync(capPath).isDirectory()) continue;

    const capJsonPath = path.join(capPath, 'capability.json');
    if (fs.existsSync(capJsonPath)) {
      try {
        const capability = JSON.parse(fs.readFileSync(capJsonPath, 'utf-8'));
        capability._path = capPath; // Store path for file operations
        capabilities.push(capability);
      } catch (err) {
        console.error(`Failed to load capability ${capId}:`, err.message);
      }
    }
  }

  return capabilities;
}

/**
 * Load extraction config for a capability (if it has one)
 */
function loadExtractionConfig(agentId, capabilityId) {
  const configPath = path.join(
    AGENTS_DIR,
    agentId,
    'capabilities',
    capabilityId,
    'extraction-config.js'
  );

  if (fs.existsSync(configPath)) {
    // Clear require cache to get fresh data
    delete require.cache[require.resolve(configPath)];
    return require(configPath);
  }

  return null;
}

/**
 * Build the system prompt for an agent
 */
function buildAgentSystemPrompt(agentId) {
  const agents = loadAllAgents();
  const agent = agents[agentId];

  if (!agent) {
    return null;
  }

  // Build capabilities section
  let capabilitiesText = '';
  for (const cap of agent.capabilities) {
    capabilitiesText += `
## ${cap.name}
${cap.description}

Triggers: ${cap.triggers?.join(', ') || 'N/A'}
Actions:
${cap.actions?.map(a => `- ${a}`).join('\n') || '- No specific actions defined'}
`;

    // If this capability has extraction fields, include them
    const extractionConfig = loadExtractionConfig(agentId, cap.id);
    if (extractionConfig && extractionConfig.getTechPackFields) {
      const fields = extractionConfig.getTechPackFields();
      capabilitiesText += `
Extractable Fields:
${fields.map(f => `- ${f.field_name}: ${f.extraction_logic}`).join('\n')}
`;
    }
  }

  // Build other agents section
  const otherAgents = agent.knows_about_agents || [];
  let otherAgentsText = '';
  if (otherAgents.length > 0) {
    otherAgentsText = `
=== OTHER AGENTS YOU KNOW ===
${otherAgents.map(id => {
  const other = agents[id];
  if (other) {
    return `- ${other.name} (${other.title}): ${other.expertise?.slice(0, 2).join(', ') || 'General assistance'}`;
  }
  return `- ${id} (not yet available)`;
}).join('\n')}
`;
  }

  return `You are ${agent.name}, the ${agent.title} at L'AGENCE, a luxury fashion brand.

${agent.personality}

=== YOUR EXPERTISE ===
${agent.expertise?.map(e => `- ${e}`).join('\n') || '- General assistance'}

=== YOUR PRIORITIES ===
${Object.entries(agent.priorities || {}).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${Math.round(v * 100)}% importance`).join('\n') || '- Helping users effectively'}

=== YOUR CAPABILITIES ===
${capabilitiesText}
${otherAgentsText}
=== HANDLING USER REQUESTS ===

When users ask questions:
- Answer based on your expertise and capabilities
- Be helpful, professional, and concise
- If a request would be better handled by another agent, mention that

When users request changes to existing capabilities:
- For simple tweaks (field logic, examples, values): Offer to create a PR automatically
- For medium changes (new fields, modified behavior): Explain the change and offer to create a PR
- For complex changes (new endpoints, database changes): Explain that a plan approval is needed first

When users request new capabilities:
- Acknowledge their request
- Explain what would be involved
- Let them know a plan approval is required before implementation begins

Always represent L'AGENCE professionally.`;
}

/**
 * Get a single agent by ID
 */
function getAgent(agentId) {
  return loadAllAgents()[agentId] || null;
}

/**
 * Get all agent IDs
 */
function getAgentIds() {
  return Object.keys(loadAllAgents());
}

module.exports = {
  loadAllAgents,
  loadAgentCapabilities,
  loadExtractionConfig,
  buildAgentSystemPrompt,
  getAgent,
  getAgentIds
};
