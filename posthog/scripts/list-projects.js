#!/usr/bin/env node

const { getConfiguredAccounts, resolveAccount } = require('../lib/accounts');
const {
  parseArgs,
  parseInteger,
  printHelp,
  outputJson,
  outputError,
} = require('../lib/cli');
const { createClient, listProjects } = require('../lib/client');
const { buildMetadata, normalizeProjectList } = require('../lib/normalizer');

const HELP = `
List PostHog projects accessible to a configured account.

Usage:
  node scripts/list-projects.js [options]

Options:
  --account <name>  Account alias from POSTHOG_ACCOUNTS
  --host <url>      Override the account's private API host
  --limit <n>       Page size from 1 to 1000 (default: 100)
  --offset <n>      Result offset (default: 0)
  --help            Show this help
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
    return;
  }

  const account = resolveAccount(getConfiguredAccounts(), args.account);
  const client = createClient(account, { host: args.host });
  const limit = parseInteger(args.limit, '--limit', { defaultValue: 100, min: 1, max: 1000 });
  const offset = parseInteger(args.offset, '--offset', { defaultValue: 0, min: 0 });
  const response = await listProjects(client, { limit, offset });

  outputJson({
    metadata: buildMetadata(account.name, client, {
      path: '/api/projects/',
    }),
    pagination: { limit, offset },
    ...normalizeProjectList(response),
  });
}

main().catch(outputError);
