#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts } = require('../lib/accounts');

const HELP = `
List configured GoDaddy account aliases.

Usage:
  node scripts/list-accounts.js

Environment:
  GODADDY_ACCOUNTS      JSON object mapping account aliases to credential objects
                        Example: {"prod":{"key":"...","secret":"...","baseUrl":"https://api.godaddy.com"}}
`;

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const items = [...accounts.entries()].map(([name, credentials]) => ({
    name,
    baseUrl: credentials.baseUrl || null,
  }));

  outputJson({
    configured: accounts.size,
    accounts: items,
    defaultAccount: accounts.size === 1 ? items[0]?.name || null : null,
  });
}

try {
  main();
} catch (error) {
  outputError(error);
}
