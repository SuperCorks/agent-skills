#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request, toHref } = require('../lib/client');
const { buildMetadata, summarizePage } = require('../lib/normalizer');

const HELP = `
List Vimeo OTT live events.

Usage:
  node scripts/list-live-events.js --product <id|href> [options]

Options:
  --product <id|href>   Required product ID or href
  --query <text>        Search term
  --plan <value>        Plan filter
  --sort <mode>         alphabetical, newest, oldest, title, latest, updated_at, or created_at
  --order <dir>         ASC or DESC
  --page <n>            Page number (default: 1)
  --per-page <n>        Page size 1-100 (default: 25)
  --account <name>      Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.product) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', '--product is required');
  }

  const page = args.page ? validateInteger(args.page, '--page', 1, 100000) : 1;
  const perPage = args.perPage ? validateInteger(args.perPage, '--per-page', 1, 100) : 25;
  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const body = await request(client, '/live_events', {
    query: {
      product: toHref('products', args.product),
      query: args.query,
      plan: args.plan,
      sort: args.sort,
      order: args.order,
      page,
      per_page: perPage,
    },
  });

  outputJson({
    metadata: buildMetadata(accountName, '/live_events', { page, perPage }),
    liveEvents: summarizePage(body, 'live_events'),
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