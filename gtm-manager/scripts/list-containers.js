#!/usr/bin/env node
const { getClientFromArgs, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
List all containers in a GTM account.

Usage:
  node list-containers.js --account <id> --credentials <path> --token <path>

Options:
  -a, --account <id>    GTM account ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  JSON array of containers with id, name, type, and publicId
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.account) {
    error('Must provide --account ID');
  }

  const tagmanager = await getClientFromArgs(args);
  const res = await tagmanager.accounts.containers.list({
    parent: `accounts/${args.account}`
  });
  
  const containers = (res.data.container || []).map(c => ({
    containerId: c.containerId,
    name: c.name,
    publicId: c.publicId,
    usageContext: c.usageContext,
    path: c.path,
  }));

  output(containers);
}

main().catch(e => error(e.message));
