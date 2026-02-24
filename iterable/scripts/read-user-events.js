#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, getUserEventsByEmail, getUserEventsByUserId } = require('../lib/client');
const { normalizeEvents } = require('../lib/normalizer');

const HELP = `
Read Iterable events for a user.

Usage:
  node scripts/read-user-events.js [--email EMAIL | --user-id USER_ID] [options]

Options:
  --email <email>       User email
  --user-id <id>        User ID
  --limit <n>           Number of events (1-200, default: 30)
  --account <name>      Account name from ITERABLE_ACCOUNTS (required if multiple)
  --base-url <url>      Override API base URL (default: https://api.iterable.com/api)
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.email && !args.userId) || (args.email && args.userId)) {
    throw new SkillError('ITERABLE_ARGS_INVALID', 'Provide exactly one of --email or --user-id');
  }

  const limit = args.limit ? Number(args.limit) : 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new SkillError('ITERABLE_ARGS_INVALID', '--limit must be an integer between 1 and 200');
  }

  const accounts = parseAccounts(process.env.ITERABLE_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  if (args.email) {
    const response = await getUserEventsByEmail(client, args.email, limit);
    outputJson(normalizeEvents(response, accountName, '/events/{email}', { email: args.email, limit }));
    return;
  }

  const response = await getUserEventsByUserId(client, args.userId, limit);
  outputJson(normalizeEvents(response, accountName, '/events/byUserId/{userId}', { userId: args.userId, limit }));
}

main().catch(outputError);
