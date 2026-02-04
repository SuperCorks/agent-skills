#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Create a new GTM variable.

Usage:
  node create-variable.js --json <path|json> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --json <path|json>    Path to JSON file or inline JSON with variable config
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Variable JSON format:
  {
    "name": "Variable Name",
    "type": "v",  // Variable type
    "parameter": [...]
  }

Common variable types:
  - v: Data Layer Variable
  - jsm: Custom JavaScript
  - k: 1st Party Cookie
  - c: Constant
  - gas: Google Analytics Settings

Output:
  Created variable JSON with assigned ID
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
    error('Must provide --json with variable configuration');
  }

  // Parse JSON from file or inline
  let variableConfig;
  try {
    if (fs.existsSync(args.json)) {
      variableConfig = JSON.parse(fs.readFileSync(args.json, 'utf8'));
    } else {
      variableConfig = JSON.parse(args.json);
    }
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  const res = await tagmanager.accounts.containers.workspaces.variables.create({
    parent: workspace.path,
    requestBody: variableConfig
  });

  output(res.data);
}

main().catch(e => error(e.message));
