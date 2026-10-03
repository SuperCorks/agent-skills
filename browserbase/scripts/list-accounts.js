#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts, summarizeAccount } = require('../lib/accounts');

const HELP = `
List configured Browserbase account aliases.

Usage:
  node scripts/list-accounts.js

Environment:
  BROWSERBASE_ACCOUNTS      JSON object mapping aliases to credentials
  BROWSERBASE_API_KEY       Single-account fallback
  BROWSERBASE_PROJECT_ID    Single-account fallback project id
  BROWSERBASE_CONTEXT_ID    Single-account fallback context id

Security:
  API keys and context IDs are never printed. Each alias gets an isolated
  browse daemon session unless the account config supplies session explicitly.
`;

function main() {
  const { args } = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const items = [...accounts.entries()].map(([name, credentials]) => summarizeAccount(name, credentials));

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