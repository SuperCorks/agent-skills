#!/usr/bin/env node

const { parseArgs, parseJsonFlag, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request, toHref } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Perform a read-only GET against any Vimeo OTT API resource.

Usage:
  node scripts/get-resource.js [--path PATH | --href HREF] [options]

Options:
  --path <path>               API path such as /collections/123/items
  --href <href>               Full API href such as https://api.vhx.tv/products/123
  --query-json <json>         JSON object of query parameters
  --customer <id|href>        Optional customer href for the VHX-Customer header
  --client-ip <ip>            Optional VHX-Client-IP header
  --account <name>            Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>            Override API base URL
  --help                      Show this help message

Examples:
  node scripts/get-resource.js --path /browse --query-json '{"product":"https://api.vhx.tv/products/156019"}'
  node scripts/get-resource.js --path /products/156019/prices
  node scripts/get-resource.js --path /collections/123/items --query-json '{"include_events":1}'
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.path && !args.href) || (args.path && args.href)) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', 'Provide exactly one of --path or --href');
  }

  const query = args.queryJson ? parseJsonFlag(args.queryJson, '--query-json') : undefined;
  if (query !== undefined && (typeof query !== 'object' || query === null || Array.isArray(query))) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', '--query-json must be a JSON object');
  }

  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const target = args.href || args.path;
  const body = await request(client, target, {
    query,
    headers: {
      ...(args.customer ? { 'VHX-Customer': toHref('customers', args.customer) } : {}),
      ...(args.clientIp ? { 'VHX-Client-IP': args.clientIp } : {}),
    },
  });

  outputJson({
    metadata: buildMetadata(accountName, target, { query: query || null }),
    resource: body,
  });
}

main().catch(outputError);