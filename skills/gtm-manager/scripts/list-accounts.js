#!/usr/bin/env node
const { getClientFromArgs, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
List all GTM accounts accessible to the authenticated user.

Usage:
  node list-accounts.js --credentials <path> --token <path>

Options:
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  JSON array of accounts with id, name, and path
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const tagmanager = await getClientFromArgs(args);
  const res = await tagmanager.accounts.list();
  
  const accounts = (res.data.account || []).map(a => ({
    accountId: a.accountId,
    name: a.name,
    path: a.path,
  }));

  output(accounts);
}

main().catch(e => error(e.message));
