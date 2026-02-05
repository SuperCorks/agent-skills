#!/usr/bin/env node
/**
 * List Asana projects for a workspace
 */

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { requireAsanaSDK } = require('../lib/deps');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, getWorkspaces, getProjects } = require('../lib/client');

const HELP = `
List Asana projects for a workspace.

Usage:
  node scripts/list-projects.js [options]

Options:
  --workspace <gid>     Workspace GID (omit to list all workspaces first)
  --account <name>      Account name from ASANA_ACCOUNTS (required if multiple)
  --archived            Include archived projects
  --help                Show this help message

Environment:
  ASANA_ACCOUNTS        JSON object mapping account names to Personal Access Tokens
                        Example: {"personal": "0/abc123", "work": "0/xyz789"}

Output:
  JSON object containing:
  - metadata: Fetch timestamp, account used
  - workspace: Workspace info (if specified)
  - workspaces: Array of available workspaces (if --workspace not specified)
  - projects: Array of projects (if --workspace specified)

Examples:
  # List available workspaces
  node scripts/list-projects.js --account work

  # List projects in a workspace
  node scripts/list-projects.js --workspace 1234567890 --account work

  # Include archived projects
  node scripts/list-projects.js --workspace 1234567890 --archived
`;

async function main() {
  const args = parseArgs();

  // Show help
  if (args.help) {
    printHelp(HELP);
  }

  // Check SDK dependency
  const asana = requireAsanaSDK();

  // Parse accounts
  const accounts = parseAccounts(process.env.ASANA_ACCOUNTS);

  // Resolve account
  const { name: accountName, token } = resolveAccount(accounts, args.account);

  // Create client
  const client = createClient(asana, token);

  const output = {
    metadata: {
      fetchedAt: new Date().toISOString(),
      account: accountName,
    },
  };

  if (!args.workspace) {
    // List workspaces
    const workspaces = await getWorkspaces(client);
    output.workspaces = workspaces.map(ws => ({
      gid: ws.gid,
      name: ws.name,
      isOrganization: ws.is_organization || false,
    }));
    output.hint = 'Use --workspace <gid> to list projects for a specific workspace';
  } else {
    // List projects for workspace
    const projects = await getProjects(client, args.workspace, {
      archived: args.archived || false,
    });

    output.workspace = { gid: args.workspace };
    output.projects = projects.map(p => ({
      gid: p.gid,
      name: p.name,
      archived: p.archived || false,
      color: p.color,
      owner: p.owner ? { gid: p.owner.gid, name: p.owner.name } : null,
      notes: p.notes || null,
      createdAt: p.created_at,
      modifiedAt: p.modified_at,
      permalinkUrl: p.permalink_url,
    }));
  }

  outputJson(output);
}

main().catch(outputError);
