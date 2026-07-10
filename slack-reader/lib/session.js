/**
 * Resolve workspace credentials and construct a Slack client.
 */

const { requireSlackSDK } = require('./deps');
const { createClient } = require('./client');
const { getConfiguredWorkspaces, resolveWorkspace } = require('./workspaces');

function createSession({ workspace, urlWorkspace } = {}) {
  const WebClient = requireSlackSDK();
  const workspaces = getConfiguredWorkspaces();
  const resolved = resolveWorkspace(workspaces, workspace, urlWorkspace);

  return {
    client: createClient(WebClient, resolved.token),
    workspaceName: resolved.name,
    token: resolved.token,
  };
}

module.exports = {
  createSession,
};
