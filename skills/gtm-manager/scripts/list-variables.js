#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
List all variables in a GTM container.

Usage:
  node list-variables.js --account <id> --container <id> --credentials <path> --token <path>

Options:
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  JSON array of variables with id, name, and type
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
  
  const res = await tagmanager.accounts.containers.workspaces.variables.list({
    parent: workspace.path
  });
  
  const variables = (res.data.variable || []).map(v => ({
    variableId: v.variableId,
    name: v.name,
    type: v.type,
    path: v.path,
  }));

  output(variables);
}

main().catch(e => error(e.message));
