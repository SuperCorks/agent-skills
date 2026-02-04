#!/usr/bin/env node
const fs = require('fs');
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Duplicate a GTM tag with modifications.

Usage:
  node duplicate-tag.js --id <sourceTagId> --name <newName> --account <id> --container <id> --credentials <path> --token <path>
  node duplicate-tag.js --id <sourceTagId> --json <modifications> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <sourceTagId>    Source tag ID to duplicate (required)
  --name <newName>      New name for the duplicated tag
  --trigger <triggerId> Replace firing triggers (comma-separated IDs)
  --json <path|json>    JSON with field overrides (name, firingTriggerId, parameter values, etc.)
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Examples:
  # Duplicate with new name
  node duplicate-tag.js --id 59 --name "Google Ads | Zenoti Booking | Dallas" ...

  # Duplicate with new name and trigger
  node duplicate-tag.js --id 59 --name "Google Ads | Zenoti Booking | Dallas" --trigger 85 ...

  # Duplicate with JSON overrides (e.g., change conversion label)
  node duplicate-tag.js --id 59 --json '{"name":"New Tag","parameter":[{"key":"conversionLabel","value":"newLabel"}]}' ...

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

  if (!args.id) {
    error('Must provide --id of source tag to duplicate');
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  // Get source tag
  const sourceRes = await tagmanager.accounts.containers.workspaces.tags.get({
    path: `${workspace.path}/tags/${args.id}`
  });
  const sourceTag = sourceRes.data;

  // Remove fields that shouldn't be copied
  delete sourceTag.path;
  delete sourceTag.accountId;
  delete sourceTag.containerId;
  delete sourceTag.workspaceId;
  delete sourceTag.tagId;
  delete sourceTag.fingerprint;
  delete sourceTag.tagManagerUrl;

  // Apply overrides
  if (args.name) {
    sourceTag.name = args.name;
  }

  if (args.trigger) {
    sourceTag.firingTriggerId = args.trigger.split(',').map(t => t.trim());
  }

  // Apply JSON overrides
  if (args.json) {
    let overrides;
    try {
      if (fs.existsSync(args.json)) {
        overrides = JSON.parse(fs.readFileSync(args.json, 'utf8'));
      } else {
        overrides = JSON.parse(args.json);
      }
    } catch (e) {
      error(`Invalid JSON: ${e.message}`);
    }

    // Merge overrides
    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'parameter' && Array.isArray(value)) {
        // Merge parameters by key
        for (const override of value) {
          const existing = sourceTag.parameter?.find(p => p.key === override.key);
          if (existing) {
            Object.assign(existing, override);
          } else {
            sourceTag.parameter = sourceTag.parameter || [];
            sourceTag.parameter.push(override);
          }
        }
      } else {
        sourceTag[key] = value;
      }
    }
  }

  // Create the duplicate
  const res = await tagmanager.accounts.containers.workspaces.tags.create({
    parent: workspace.path,
    requestBody: sourceTag
  });

  output(res.data);
}

main().catch(e => error(e.message));
