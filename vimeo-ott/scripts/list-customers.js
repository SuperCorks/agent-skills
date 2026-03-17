#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request, toHref } = require('../lib/client');
const { buildMetadata, summarizePage } = require('../lib/normalizer');

const HELP = `
List Vimeo OTT customers.

Usage:
  node scripts/list-customers.js [options]

Options:
  --account <name>      Account name from VIMEO_OTT_ACCOUNTS
  --product <id|href>   Filter by product
  --email <email>       Exact email filter
  --query <text>        Search term
  --status <value>      enabled, disabled, cancelled, refunded, expired, paused, or all
  --sort <mode>         newest, oldest, or latest
  --page <n>            Page number (default: 1)
  --per-page <n>        Page size 1-100 (default: 25)
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const page = args.page ? validateInteger(args.page, '--page', 1, 100000) : 1;
  const perPage = args.perPage ? validateInteger(args.perPage, '--per-page', 1, 100) : 25;
  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const body = await request(client, '/customers', {
    query: {
      product: toHref('products', args.product),
      email: args.email,
      query: args.query,
      status: args.status,
      sort: args.sort,
      page,
      per_page: perPage,
    },
  });

  outputJson({
    metadata: buildMetadata(accountName, '/customers', { page, perPage }),
    customers: summarizePage(body, 'customers'),
  });
}

function validateInteger(value, flagName, min, max) {
  const parsed = parseInteger(value, flagName, { min, max });
  if (!parsed.valid) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', parsed.message);
  }
  return parsed.value;
}

main().catch(outputError);