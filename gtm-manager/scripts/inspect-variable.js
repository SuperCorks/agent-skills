#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Get full details of a GTM variable.

Usage:
  node inspect-variable.js --id <variableId> --account <id> --container <id> --credentials <path> --token <path>
  node inspect-variable.js --name <variableName> --account <id> --container <id> --credentials <path> --token <path>

Options:
  --id <variableId>     Variable ID to inspect
  --name <variableName> Variable name to search for (partial match)
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  Full JSON configuration of the variable
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
    const res = await tagmanager.accounts.containers.workspaces.variables.get({
      path: `${workspace.path}/variables/${args.id}`
    });
    output(res.data);
  } else {
    // Search by name
    const res = await tagmanager.accounts.containers.workspaces.variables.list({
      parent: workspace.path
    });
    const matches = (res.data.variable || []).filter(v => 
      v.name.toLowerCase().includes(args.name.toLowerCase())
    );
    if (matches.length === 0) {
      error(`No variables found matching "${args.name}"`);
    }
    output(matches);
  }
}

main().catch(e => error(e.message));
