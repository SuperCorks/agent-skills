#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Get full details of a GTM trigger.

Usage:
  node inspect-trigger.js --id <triggerId> --account <id> --container <id> --credentials <path> --token <path>
  node inspect-trigger.js --name <triggerName> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <triggerId>      Trigger ID to inspect
  --name <triggerName>  Trigger name to search for (partial match)
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  Full JSON configuration of the trigger
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
    const res = await tagmanager.accounts.containers.workspaces.triggers.get({
      path: `${workspace.path}/triggers/${args.id}`
    });
    output(res.data);
  } else {
    // Search by name
    const res = await tagmanager.accounts.containers.workspaces.triggers.list({
      parent: workspace.path
    });
    const matches = (res.data.trigger || []).filter(t => 
      t.name.toLowerCase().includes(args.name.toLowerCase())
    );
    if (matches.length === 0) {
      error(`No triggers found matching "${args.name}"`);
    }
    output(matches);
  }
}

main().catch(e => error(e.message));
