#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Create a new GTM tag.

Usage:
  node create-tag.js --json <path|json> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --json <path|json>    Path to JSON file or inline JSON with tag config
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Tag JSON format:
  {
    "name": "Tag Name",
    "type": "awct",  // Tag type (awct, gaawe, html, etc.)
    "parameter": [...],
    "firingTriggerId": ["triggerId1", "triggerId2"]
  }

Common tag types:
  - awct: Google Ads Conversion Tracking
  - gaawe: GA4 Event
  - googtag: Google Tag
  - html: Custom HTML
  - sp: Google Ads Remarketing

Output:
  Created tag JSON with assigned ID
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

  if (!args.json) {
    error('Must provide --json with tag configuration');
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

  const res = await tagmanager.accounts.containers.workspaces.tags.create({
    parent: workspace.path,
    requestBody: tagConfig
  });

  output(res.data);
}

main().catch(e => error(e.message));
