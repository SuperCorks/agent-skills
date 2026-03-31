#!/usr/bin/env node

const { parseArgs, parseOptionalInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount, inferBaseUrl } = require('../lib/accounts');
const { createClient, listRecords } = require('../lib/client');
const { buildMetadata, normalizeRecord } = require('../lib/normalizer');

const HELP = `
Check whether a GoDaddy domain has a specific DNS record.

Usage:
  node scripts/check-record.js --domain DOMAIN --type TYPE --name NAME [options]

Options:
  --domain <domain>       Domain name to inspect
  --type <type>           Record type to match
  --name <name>           Record name to match
  --data <value>          Optional exact data match
  --ttl <n>               Optional exact TTL match
  --priority <n>          Optional exact priority match
  --service <value>       Optional exact service match
  --protocol <value>      Optional exact protocol match
  --weight <n>            Optional exact weight match
  --port <n>              Optional exact port match
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

  if (!args.domain || !args.type || !args.name) {
    throw new SkillError('GODADDY_ARGS_INVALID', '--domain, --type, and --name are required');
  }

  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const resolved = resolveAccount(accounts, args.account);
  const client = createClient(resolved, {
    baseUrl: inferBaseUrl(resolved.name, args.baseUrl || resolved.baseUrl),
  });

  const records = await listRecords(client, args.domain, {
    shopperId: args.shopperId,
  });

  const criteria = {
    type: String(args.type).toUpperCase(),
    name: args.name,
    data: args.data,
    ttl: parseOptionalInteger(args.ttl, '--ttl'),
    priority: parseOptionalInteger(args.priority, '--priority'),
    service: args.service,
    protocol: args.protocol,
    weight: parseOptionalInteger(args.weight, '--weight'),
    port: parseOptionalInteger(args.port, '--port'),
  };

  const matches = records.filter((record) => matchesCriteria(record, criteria));

  outputJson({
    metadata: buildMetadata(resolved.name, '/check-record', {
      baseUrl: client.baseUrl,
      domain: args.domain,
    }),
    exists: matches.length > 0,
    criteria,
    matches: matches.map(normalizeRecord),
  });
}

function matchesCriteria(record, criteria) {
  if (record.type !== criteria.type) {
    return false;
  }

  if (record.name !== criteria.name) {
    return false;
  }

  return (
    matchesOptional(record.data, criteria.data) &&
    matchesOptionalNumber(record.ttl, criteria.ttl) &&
    matchesOptionalNumber(record.priority, criteria.priority) &&
    matchesOptional(record.service, criteria.service) &&
    matchesOptional(record.protocol, criteria.protocol) &&
    matchesOptionalNumber(record.weight, criteria.weight) &&
    matchesOptionalNumber(record.port, criteria.port)
  );
}

function matchesOptional(actual, expected) {
  if (expected === undefined) {
    return true;
  }

  return actual === expected;
}

function matchesOptionalNumber(actual, expected) {
  if (expected === undefined) {
    return true;
  }

  return Number(actual) === expected;
}

main().catch(outputError);
