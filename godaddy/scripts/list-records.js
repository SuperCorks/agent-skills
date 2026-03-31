#!/usr/bin/env node

const {
  parseArgs,
  parseOptionalInteger,
  printHelp,
  outputJson,
  outputError,
} = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount, inferBaseUrl } = require('../lib/accounts');
const { createClient, listRecords, listRecordsByTypeName } = require('../lib/client');
const { buildMetadata, normalizeRecord } = require('../lib/normalizer');

const HELP = `
List DNS records for a GoDaddy domain.

Usage:
  node scripts/list-records.js --domain DOMAIN [options]

Options:
  --domain <domain>       Domain name to inspect
  --type <type>           Optional record type filter
  --name <name>           Optional record name filter; requires --type
  --limit <n>             Optional limit passed to record lookup
  --offset <n>            Optional offset passed to record lookup
  --account <name>        Account name from GODADDY_ACCOUNTS
  --base-url <url>        Override API base URL
  --shopper-id <id>       Optional shopper ID for reseller contexts
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.domain) {
    throw new SkillError('GODADDY_ARGS_INVALID', '--domain is required');
  }

  if (args.name && !args.type) {
    throw new SkillError('GODADDY_ARGS_INVALID', '--name requires --type');
  }

  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const resolved = resolveAccount(accounts, args.account);
  const client = createClient(resolved, {
    baseUrl: inferBaseUrl(resolved.name, args.baseUrl || resolved.baseUrl),
  });

  const query = {
    limit: parseOptionalInteger(args.limit, '--limit'),
    offset: parseOptionalInteger(args.offset, '--offset'),
  };

  let records;
  let endpoint = '/v1/domains/{domain}/records';

  if (args.type && args.name) {
    endpoint = '/v1/domains/{domain}/records/{type}/{name}';
    records = await listRecordsByTypeName(client, args.domain, args.type.toUpperCase(), args.name, {
      shopperId: args.shopperId,
      query,
    });
  } else {
    records = await listRecords(client, args.domain, {
      shopperId: args.shopperId,
      query,
    });

    if (args.type) {
      const type = args.type.toUpperCase();
      records = records.filter((record) => record.type === type);
    }
  }

  outputJson({
    metadata: buildMetadata(resolved.name, endpoint, {
      baseUrl: client.baseUrl,
      domain: args.domain,
      type: args.type ? args.type.toUpperCase() : undefined,
      name: args.name,
      count: records.length,
    }),
    records: records.map(normalizeRecord),
  });
}

main().catch(outputError);
