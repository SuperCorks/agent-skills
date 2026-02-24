#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, getUserByEmail, getUserByUserId } = require('../lib/client');
const { normalizeUser } = require('../lib/normalizer');

const HELP = `
Read an Iterable user profile by email or userId.

Usage:
  node scripts/read-user.js [--email EMAIL | --user-id USER_ID] [options]

Options:
  --email <email>       User email
  --user-id <id>        User ID
  --account <name>      Account name from ITERABLE_ACCOUNTS (required if multiple)
  --base-url <url>      Override API base URL (default: https://api.iterable.com/api)
  --help                Show this help message

Environment:
  ITERABLE_ACCOUNTS     JSON object mapping account names to Iterable API keys
                        Example: {"prod":"api_key_1","sandbox":"api_key_2"}
`;

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.email && !args.userId) || (args.email && args.userId)) {
    throw new SkillError('ITERABLE_ARGS_INVALID', 'Provide exactly one of --email or --user-id');
  }

  const accounts = parseAccounts(process.env.ITERABLE_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  if (args.email) {
    const response = await getUserByEmail(client, args.email);
    outputJson(normalizeUser(response, accountName, '/users/getByEmail', { email: args.email }));
    return;
  }

  const response = await getUserByUserId(client, args.userId);
  outputJson(normalizeUser(response, accountName, '/users/byUserId', { userId: args.userId }));
}

main().catch(outputError);
