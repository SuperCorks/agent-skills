#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, getUserFields } = require('../lib/client');
const { normalizeFields } = require('../lib/normalizer');

const HELP = `
List Iterable user profile fields.

Usage:
  node scripts/list-user-fields.js [options]

Options:
  --account <name>      Account name from ITERABLE_ACCOUNTS (required if multiple)
  --base-url <url>      Override API base URL (default: https://api.iterable.com/api)
  --help                Show this help message

Environment:
  ITERABLE_ACCOUNTS     JSON object mapping account names to Iterable API keys
`;

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.ITERABLE_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const response = await getUserFields(client);
  outputJson(normalizeFields(response, accountName, '/users/getFields'));
}

main().catch(outputError);
