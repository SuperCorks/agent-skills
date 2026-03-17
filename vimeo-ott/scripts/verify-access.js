#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Verify Vimeo OTT API access for an account alias.

Usage:
  node scripts/verify-access.js [options]

Options:
  --account <name>      Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>      Override API base URL (default: https://api.vhx.tv)
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const [products, customers, videos, collections, traffic] = await Promise.all([
    request(client, '/products', { query: { per_page: 5 } }),
    request(client, '/customers', { query: { per_page: 1, status: 'all' } }),
    request(client, '/videos', { query: { per_page: 1 } }),
    request(client, '/collections', { query: { per_page: 1 } }),
    request(client, '/analytics', { query: { type: 'traffic', from: '1-month-ago', to: 'today' } }),
  ]);

  outputJson({
    metadata: buildMetadata(accountName, '/verify-access'),
    verification: {
      products: {
        total: products.total,
        names: (products._embedded?.products || []).map((product) => product.name),
      },
      customers: {
        total: customers.total,
      },
      videos: {
        total: videos.total,
      },
      collections: {
        total: collections.total,
      },
      analytics: {
        trafficKeys: Object.keys(traffic.data || {}),
      },
    },
  });
}

main().catch(outputError);