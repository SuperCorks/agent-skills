#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts } = require('../lib/accounts');

const HELP = `
List configured Vimeo OTT account aliases.

Usage:
  node scripts/list-accounts.js

Environment:
  VIMEO_OTT_ACCOUNTS   JSON object mapping account aliases to API keys
                       Example: {"yogaworks":"your_api_key"}
`;

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  outputJson({
    configured: accounts.size,
    accounts: [...accounts.keys()],
    defaultAccount: accounts.size === 1 ? [...accounts.keys()][0] : null,
  });
}

try {
  main();
} catch (error) {
  outputError(error);
}