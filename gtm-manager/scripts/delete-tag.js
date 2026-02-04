#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Delete a GTM tag.

Usage:
  node delete-tag.js --id <tagId> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <tagId>          Tag ID to delete (required)
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  Confirmation of deletion
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
    error('Must provide --id of tag to delete');
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  await tagmanager.accounts.containers.workspaces.tags.delete({
    path: `${workspace.path}/tags/${args.id}`
  });

  output({ success: true, deleted: 'tag', id: args.id });
}

main().catch(e => error(e.message));
