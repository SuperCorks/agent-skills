#!/usr/bin/env node
/**
 * Read an Asana task by URL, ID, or name search
 * 
 * Fetches task details and comments.
 */

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { requireAsanaSDK } = require('../lib/deps');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { parseAsanaUrl } = require('../lib/url-parser');
const { createClient, getTask, getTaskComments, searchTasks, getWorkspaces } = require('../lib/client');
const { normalizeOutput } = require('../lib/normalizer');

const HELP = `
Read an Asana task by URL, ID, or name search.

Usage:
  node scripts/read-task.js [--url URL | --id GID | --name SEARCH] [options]

One of --url, --id, or --name is required.

Options:
  --url <url>           Asana task URL
  --id <gid>            Asana task GID (numeric ID)
  --name <search>       Search for task by name (requires --workspace)
  --account <name>      Account name from ASANA_ACCOUNTS (required if multiple)
  --workspace <gid>     Workspace GID (required for --name search)
  --help                Show this help message

Environment:
  ASANA_ACCOUNTS        JSON object mapping account names to Personal Access Tokens
                        Example: {"personal": "0/abc123", "work": "0/xyz789"}

Output:
  JSON object containing:
  - metadata: Fetch timestamp, account used
  - task: Task details (name, notes, assignee, projects, tags, dates, etc.)
  - comments: Array of comments on the task

Examples:
  # By URL
  node scripts/read-task.js --url "https://app.asana.com/0/1234/5678"

  # By task ID
  node scripts/read-task.js --id 5678

  # By name search (requires workspace)
  node scripts/read-task.js --name "Fix login bug" --workspace 1234 --account work

  # List available workspaces
  node scripts/read-task.js --id 0 --account personal 2>&1 | grep -i workspace
`;

async function main() {
  const args = parseArgs();

  // Show help
  if (args.help) {
    printHelp(HELP);
  }

  // Validate at least one task identifier
  if (!args.url && !args.id && !args.name) {
    throw new SkillError('ASANA_URL_INVALID', 'One of --url, --id, or --name is required');
  }

  // Check SDK dependency
  const asana = requireAsanaSDK();

  // Parse accounts
  const accounts = parseAccounts(process.env.ASANA_ACCOUNTS);

  // Resolve account
  const { name: accountName, token } = resolveAccount(accounts, args.account);

  // Create client
  const client = createClient(asana, token);

  // Resolve task GID
  let taskGid;

  if (args.url) {
    // Parse URL
    const { taskGid: gid } = parseAsanaUrl(args.url);
    taskGid = gid;
  } else if (args.id) {
    // Use directly
    taskGid = args.id;
  } else if (args.name) {
    // Search by name
    if (!args.workspace) {
      // Help user by listing available workspaces
      const workspaces = await getWorkspaces(client);
      const wsInfo = workspaces.map(ws => `  ${ws.gid}: ${ws.name}`).join('\n');
      throw new SkillError('ASANA_WORKSPACE_REQUIRED', `Available workspaces:\n${wsInfo}`);
    }

    const results = await searchTasks(client, args.workspace, args.name);

    if (results.length === 0) {
      throw new SkillError('ASANA_SEARCH_NO_RESULTS', `No tasks matching "${args.name}"`);
    }

    if (results.length > 1) {
      const matches = results.slice(0, 5).map(t => `  ${t.gid}: ${t.name}`).join('\n');
      throw new SkillError('ASANA_SEARCH_AMBIGUOUS', `Found ${results.length} tasks:\n${matches}`);
    }

    taskGid = results[0].gid;
  }

  // Fetch task
  const task = await getTask(client, taskGid);

  // Fetch comments
  const comments = await getTaskComments(client, taskGid);

  // Normalize and output
  const output = normalizeOutput(task, comments, accountName);
  outputJson(output);
}

main().catch(outputError);
