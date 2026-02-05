/**
 * Multi-workspace management for Slack
 * 
 * SLACK_WORKSPACES format: JSON object {"personal": "xoxb-...", "company": "xoxb-..."}
 * 
 * Falls back to SLACK_BOT_TOKEN for single-workspace usage.
 */

const { SkillError } = require('./errors');

/**
 * Parse SLACK_WORKSPACES environment variable
 * 
 * @param {string} envValue - JSON string of workspace tokens
 * @returns {Map<string, string>} Map of workspace alias to token
 * @throws {SkillError} If JSON is invalid
 */
function parseWorkspaces(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  try {
    const parsed = JSON.parse(envValue);
    
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillError('SLACK_WORKSPACES_INVALID', 'SLACK_WORKSPACES must be a JSON object');
    }

    const workspaces = new Map();
    for (const [name, token] of Object.entries(parsed)) {
      if (typeof token !== 'string' || !token.trim()) {
        throw new SkillError('SLACK_WORKSPACES_INVALID', `Invalid token for workspace "${name}"`);
      }
      if (!token.startsWith('xoxb-')) {
        throw new SkillError('SLACK_WORKSPACES_INVALID', `Token for "${name}" must start with xoxb-`);
      }
      workspaces.set(name.toLowerCase(), token.trim());
    }

    return workspaces;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    throw new SkillError('SLACK_WORKSPACES_INVALID', `Invalid JSON: ${err.message}`);
  }
}

/**
 * Get all configured workspaces (from SLACK_WORKSPACES or fallback to SLACK_BOT_TOKEN)
 * 
 * @returns {Map<string, string>} Map of workspace alias to token
 */
function getConfiguredWorkspaces() {
  // Try SLACK_WORKSPACES first (multi-workspace)
  const workspacesEnv = process.env.SLACK_WORKSPACES;
  if (workspacesEnv) {
    return parseWorkspaces(workspacesEnv);
  }

  // Fall back to single SLACK_BOT_TOKEN
  const singleToken = process.env.SLACK_BOT_TOKEN;
  if (singleToken) {
    return new Map([['default', singleToken]]);
  }

  return new Map();
}

/**
 * Resolve which workspace to use
 * 
 * Resolution order:
 * 1. If --workspace flag provided, use that
 * 2. If URL domain matches a workspace alias, use that
 * 3. If only one workspace configured, use that
 * 4. If multiple workspaces and can't determine, throw SLACK_WORKSPACE_AMBIGUOUS
 * 
 * @param {Map<string, string>} workspaces - Parsed workspaces map
 * @param {string} [specifiedName] - Workspace name from --workspace flag
 * @param {string} [urlDomain] - Workspace domain extracted from URL (e.g., "company" from "company.slack.com")
 * @returns {{ name: string, token: string }} Resolved workspace
 * @throws {SkillError} If workspace cannot be resolved
 */
function resolveWorkspace(workspaces, specifiedName, urlDomain) {
  const workspaceCount = workspaces.size;

  // No workspaces configured
  if (workspaceCount === 0) {
    throw new SkillError('SLACK_AUTH_MISSING');
  }

  // Explicit --workspace flag takes priority
  if (specifiedName) {
    const normalizedName = specifiedName.toLowerCase();
    const token = workspaces.get(normalizedName);
    if (!token) {
      const names = [...workspaces.keys()].join(', ');
      throw new SkillError('SLACK_WORKSPACE_NOT_FOUND', `"${specifiedName}" not in [${names}]`);
    }
    return { name: normalizedName, token };
  }

  // Try to match URL domain to workspace alias
  if (urlDomain) {
    const normalizedDomain = urlDomain.toLowerCase();
    // Check for exact match
    if (workspaces.has(normalizedDomain)) {
      return { name: normalizedDomain, token: workspaces.get(normalizedDomain) };
    }
    // Check if any alias is a substring of the domain or vice versa
    for (const [alias, token] of workspaces.entries()) {
      if (normalizedDomain.includes(alias) || alias.includes(normalizedDomain)) {
        return { name: alias, token };
      }
    }
  }

  // One workspace - use it
  if (workspaceCount === 1) {
    const [name, token] = [...workspaces.entries()][0];
    return { name, token };
  }

  // Multiple workspaces - can't determine which one
  const names = [...workspaces.keys()];
  throw new SkillError('SLACK_WORKSPACE_AMBIGUOUS', names.join(', '));
}

/**
 * Get list of available workspace names for prompt
 * 
 * @returns {string[]} Array of workspace alias names
 */
function getAvailableWorkspaces() {
  const workspaces = getConfiguredWorkspaces();
  return [...workspaces.keys()].filter(name => name !== 'default');
}

module.exports = {
  parseWorkspaces,
  getConfiguredWorkspaces,
  resolveWorkspace,
  getAvailableWorkspaces,
};
