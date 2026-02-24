#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, getUsersInList } = require('../lib/client');
const { normalizeListUsers } = require('../lib/normalizer');

const HELP = `
List users in an Iterable list.

Usage:
  node scripts/list-users-in-list.js --list-id LIST_ID [options]

Options:
  --list-id <id>        Iterable list ID (required)
  --prefer-user-id      Prefer userId when available (hybrid projects)
  --account <name>      Account name from ITERABLE_ACCOUNTS (required if multiple)
  --base-url <url>      Override API base URL (default: https://api.iterable.com/api)
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp(HELP);
  }

  if (!args.listId) {
    throw new SkillError('ITERABLE_ARGS_INVALID', '--list-id is required');
  }

  const listId = Number(args.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    throw new SkillError('ITERABLE_ARGS_INVALID', '--list-id must be a positive integer');
  }

  const accounts = parseAccounts(process.env.ITERABLE_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const response = await getUsersInList(client, listId, Boolean(args.preferUserId));
  outputJson(normalizeListUsers(response, accountName, '/lists/getUsers', {
    listId,
    preferUserId: Boolean(args.preferUserId),
  }));
}

main().catch(outputError);
