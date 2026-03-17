#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request, getPathFromIdOrHref, toHref } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Read a Vimeo OTT customer and optionally fetch watching or watchlist data.

Usage:
  node scripts/read-customer.js [--id ID | --href HREF] [options]

Options:
  --id <id>                     Customer ID
  --href <href>                 Customer href
  --product <id|href>           Optional product scope for the customer lookup
  --include-watching            Also fetch /watching using the VHX-Customer header
  --include-watchlist           Also fetch /watchlist
  --watching-per-page <n>       Watching page size 1-100 (default: 25)
  --watchlist-per-page <n>      Watchlist page size 1-100 (default: 25)
  --account <name>              Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>              Override API base URL
  --help                        Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.id && !args.href) || (args.id && args.href)) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', 'Provide exactly one of --id or --href');
  }

  const watchingPerPage = args.watchingPerPage ? validateInteger(args.watchingPerPage, '--watching-per-page', 1, 100) : 25;
  const watchlistPerPage = args.watchlistPerPage ? validateInteger(args.watchlistPerPage, '--watchlist-per-page', 1, 100) : 25;
  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const customerHref = toHref('customers', args.href || args.id);
  const customerPath = getPathFromIdOrHref('customers', args.href || args.id);
  const customer = await request(client, customerPath, {
    query: {
      product: toHref('products', args.product),
    },
  });

  const result = {
    metadata: buildMetadata(accountName, customerPath),
    customer,
  };

  if (args.includeWatching) {
    result.watching = await request(client, `${customerPath}/watching`, {
      query: { per_page: watchingPerPage },
      headers: { 'VHX-Customer': customerHref },
    });
  }

  if (args.includeWatchlist) {
    result.watchlist = await request(client, `${customerPath}/watchlist`, {
      query: { per_page: watchlistPerPage },
    });
  }

  outputJson(result);
}

function validateInteger(value, flagName, min, max) {
  const parsed = parseInteger(value, flagName, { min, max });
  if (!parsed.valid) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', parsed.message);
  }
  return parsed.value;
}

main().catch(outputError);