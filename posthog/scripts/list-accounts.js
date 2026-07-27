#!/usr/bin/env node

const { getConfiguredAccounts } = require('../lib/accounts');
const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');

const HELP = `
List configured PostHog account aliases without exposing personal API keys.

Usage:
  node scripts/list-accounts.js

Environment:
  POSTHOG_ACCOUNTS          JSON object mapping aliases to credential objects
  POSTHOG_PERSONAL_API_KEY  Single-account fallback
  POSTHOG_HOST              Single-account private API host
  POSTHOG_PROJECT_ID        Single-account default project
`;

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
    return;
  }

  const accounts = getConfiguredAccounts();
  const items = [...accounts.entries()].map(([name, account]) => ({
    name,
    host: account.host,
    projectId: account.projectId || null,
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
