#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
List all tags in a GTM container.

Usage:
  node list-tags.js --account <id> --container <id> --credentials <path> --token <path>

Options:
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  JSON array of tags with id, name, type, and firing triggers
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

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);
  
  const res = await tagmanager.accounts.containers.workspaces.tags.list({
    parent: workspace.path
  });
  
  const tags = (res.data.tag || []).map(t => ({
    tagId: t.tagId,
    name: t.name,
    type: t.type,
    firingTriggerId: t.firingTriggerId || [],
    path: t.path,
  }));

  output(tags);
}

main().catch(e => error(e.message));
