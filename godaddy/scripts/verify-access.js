#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts, resolveAccount, inferBaseUrl } = require('../lib/accounts');
const { createClient, listDomains, listRecords } = require('../lib/client');
const { buildMetadata, normalizeDomainSummary, normalizeRecord } = require('../lib/normalizer');

const HELP = `
Verify GoDaddy API access for an account alias.

Usage:
  node scripts/verify-access.js [options]

Options:
  --account <name>      Account name from GODADDY_ACCOUNTS
  --base-url <url>      Override API base URL
  --shopper-id <id>     Optional shopper ID for reseller contexts
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const resolved = resolveAccount(accounts, args.account);
  const client = createClient(resolved, {
    baseUrl: inferBaseUrl(resolved.name, args.baseUrl || resolved.baseUrl),
  });

  const domains = await listDomains(client, {
    shopperId: args.shopperId,
    query: { limit: 5 },
  });

  const sampleDomains = domains.map(normalizeDomainSummary);
  const firstDomain = sampleDomains[0]?.domain;
  const firstDomainRecords = firstDomain
    ? (await listRecords(client, firstDomain, { shopperId: args.shopperId })).slice(0, 10).map(normalizeRecord)
    : [];

  outputJson({
    metadata: buildMetadata(resolved.name, '/verify-access', {
      baseUrl: client.baseUrl,
    }),
    verification: {
      domainCountSample: sampleDomains.length,
      sampleDomains,
      firstDomain,
      firstDomainRecordCountSample: firstDomainRecords.length,
      firstDomainRecords,
    },
  });
}

main().catch(outputError);
