#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Update an existing GTM trigger.

Usage:
  node update-trigger.js --id <triggerId> --json <path|json> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <triggerId>      Trigger ID to update (required)
  --json <path|json>    Path to JSON file or inline JSON with updated config
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Note:
  The JSON should contain the full trigger configuration.
  Partial updates are not supported - include all fields.

Output:
  Updated trigger JSON
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.account || !args.container) {
    error('Must provide --account and --container IDs');
  }

  if (!args.id) {
    error('Must provide --id of trigger to update');
  }

  if (!args.json) {
    error('Must provide --json with updated configuration');
  }

  // Parse JSON from file or inline
  let triggerConfig;
  try {
    if (fs.existsSync(args.json)) {
      triggerConfig = JSON.parse(fs.readFileSync(args.json, 'utf8'));
    } else {
      triggerConfig = JSON.parse(args.json);
    }
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  const res = await tagmanager.accounts.containers.workspaces.triggers.update({
    path: `${workspace.path}/triggers/${args.id}`,
    requestBody: triggerConfig
  });

  output(res.data);
}

main().catch(e => error(e.message));
