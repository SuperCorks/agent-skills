#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Update an existing GTM tag.

Usage:
  node update-tag.js --id <tagId> --json <path|json> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <tagId>          Tag ID to update (required)
  --json <path|json>    Path to JSON file or inline JSON with updated config
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Note:
  The JSON should contain the full tag configuration.
  Partial updates are not supported - include all fields.

Output:
  Updated tag JSON
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
    error('Must provide --id of tag to update');
  }

  if (!args.json) {
    error('Must provide --json with updated configuration');
  }

  // Parse JSON from file or inline
  let tagConfig;
  try {
    if (fs.existsSync(args.json)) {
      tagConfig = JSON.parse(fs.readFileSync(args.json, 'utf8'));
    } else {
      tagConfig = JSON.parse(args.json);
    }
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  const res = await tagmanager.accounts.containers.workspaces.tags.update({
    path: `${workspace.path}/tags/${args.id}`,
    requestBody: tagConfig
  });

  output(res.data);
}

main().catch(e => error(e.message));
