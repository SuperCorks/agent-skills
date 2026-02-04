#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Get full details of a GTM tag.

Usage:
  node inspect-tag.js --id <tagId> --account <id> --container <id> --credentials <path> --token <path>
  node inspect-tag.js --name <tagName> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <tagId>          Tag ID to inspect
  --name <tagName>      Tag name to search for (partial match)
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  Full JSON configuration of the tag
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

  if (!args.id && !args.name) {
    error('Must provide --id or --name');
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  if (args.id) {
    const res = await tagmanager.accounts.containers.workspaces.tags.get({
      path: `${workspace.path}/tags/${args.id}`
    });
    output(res.data);
  } else {
    // Search by name
    const res = await tagmanager.accounts.containers.workspaces.tags.list({
      parent: workspace.path
    });
    const matches = (res.data.tag || []).filter(t => 
      t.name.toLowerCase().includes(args.name.toLowerCase())
    );
    if (matches.length === 0) {
      error(`No tags found matching "${args.name}"`);
    }
    output(matches);
  }
}

main().catch(e => error(e.message));
