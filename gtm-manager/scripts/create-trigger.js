#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Create a new GTM trigger.

Usage:
  node create-trigger.js --json <path|json> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --json <path|json>    Path to JSON file or inline JSON with trigger config
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Trigger JSON format:
  {
    "name": "Trigger Name",
    "type": "customEvent",
    "customEventFilter": [...],
    "filter": [...]
  }

Common trigger types:
  - pageview: Page View
  - customEvent: Custom Event
  - click: Click - All Elements
  - linkClick: Click - Just Links
  - formSubmission: Form Submission
  - windowLoaded: Window Loaded
  - domReady: DOM Ready

Output:
  Created trigger JSON with assigned ID
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
    error('Must provide --json with trigger configuration');
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

  const res = await tagmanager.accounts.containers.workspaces.triggers.create({
    parent: workspace.path,
    requestBody: triggerConfig
  });

  output(res.data);
}

main().catch(e => error(e.message));
