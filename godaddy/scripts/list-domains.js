#!/usr/bin/env node

const {
  parseArgs,
  parseCsv,
  printHelp,
  outputJson,
  outputError,
} = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount, inferBaseUrl } = require('../lib/accounts');
const { createClient, listDomains } = require('../lib/client');
const { buildMetadata, normalizeDomainSummary } = require('../lib/normalizer');

const HELP = `
List domains in a GoDaddy account.

Usage:
  node scripts/list-domains.js [options]

Options:
  --account <name>         Account name from GODADDY_ACCOUNTS
  --base-url <url>         Override API base URL
  --shopper-id <id>        Optional shopper ID for reseller contexts
  --status <csv>           Comma-separated domain statuses
  --status-group <csv>     Comma-separated status groups
  --includes <csv>         Optional includes: authCode,contacts,nameServers
  --limit <n>              Max domains to return (1-1000, default 100)
  --marker <domain>        Marker domain for pagination
  --modified-date <iso>    Only include domains modified since this timestamp
  --help                   Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const limit = args.limit === undefined ? 100 : Number.parseInt(String(args.limit), 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new SkillError('GODADDY_ARGS_INVALID', '--limit must be an integer between 1 and 1000');
  }

  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const resolved = resolveAccount(accounts, args.account);
  const client = createClient(resolved, {
    baseUrl: inferBaseUrl(resolved.name, args.baseUrl || resolved.baseUrl),
  });

  const statuses = parseCsv(args.status);
  const statusGroups = parseCsv(args.statusGroup);
  const includes = parseCsv(args.includes);

  const domains = await listDomains(client, {
    shopperId: args.shopperId,
    query: {
      statuses,
      statusGroups,
      includes,
      limit,
      marker: args.marker,
      modifiedDate: args.modifiedDate,
    },
  });

  outputJson({
    metadata: buildMetadata(resolved.name, '/v1/domains', {
      baseUrl: client.baseUrl,
      count: domains.length,
      limit,
    }),
    domains: domains.map(normalizeDomainSummary),
  });
}

main().catch(outputError);
