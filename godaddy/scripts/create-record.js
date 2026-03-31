#!/usr/bin/env node

const { parseArgs, parseOptionalInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount, inferBaseUrl } = require('../lib/accounts');
const { createClient, addRecords, listRecords } = require('../lib/client');
const { buildMetadata, normalizeRecord, compactObject } = require('../lib/normalizer');

const HELP = `
Create a new DNS record for a GoDaddy domain.

Usage:
  node scripts/create-record.js --domain DOMAIN --type TYPE --name NAME --data VALUE [options]

Options:
  --domain <domain>       Domain name to modify
  --type <type>           Record type to create
  --name <name>           Record name to create
  --data <value>          Record value
  --ttl <n>               Optional TTL
  --priority <n>          Required for MX and SRV
  --service <value>       Required for SRV
  --protocol <value>      Required for SRV
  --weight <n>            Required for SRV
  --port <n>              Required for SRV
  --account <name>        Account name from GODADDY_ACCOUNTS
  --base-url <url>        Override API base URL
  --shopper-id <id>       Optional shopper ID for reseller contexts
  --confirm               Execute the write; otherwise output a preview only
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.domain || !args.type || !args.name || !args.data) {
    throw new SkillError('GODADDY_ARGS_INVALID', '--domain, --type, --name, and --data are required');
  }

  const record = buildRecord(args);
  const accounts = parseAccounts(process.env.GODADDY_ACCOUNTS);
  const resolved = resolveAccount(accounts, args.account);
  const client = createClient(resolved, {
    baseUrl: inferBaseUrl(resolved.name, args.baseUrl || resolved.baseUrl),
  });

  const existingRecords = await listRecords(client, args.domain, {
    shopperId: args.shopperId,
  });

  const identicalMatches = existingRecords.filter((item) => isSameRecord(item, record));
  const sameSlotRecords = existingRecords.filter(
    (item) => item.type === record.type && item.name === record.name
  );

  const preview = {
    action: 'add-record',
    requiresConfirm: true,
    endpoint: '/v1/domains/{domain}/records',
    domain: args.domain,
    record,
    sameSlotRecords: sameSlotRecords.map(normalizeRecord),
    identicalMatchCount: identicalMatches.length,
  };

  if (identicalMatches.length > 0) {
    outputJson({
      metadata: buildMetadata(resolved.name, '/create-record', {
        baseUrl: client.baseUrl,
        changed: false,
        reason: 'identical_record_already_exists',
      }),
      preview,
      result: {
        changed: false,
        alreadyPresent: true,
        matches: identicalMatches.map(normalizeRecord),
      },
    });
    return;
  }

  if (!args.confirm) {
    outputJson({
      metadata: buildMetadata(resolved.name, '/create-record', {
        baseUrl: client.baseUrl,
        changed: false,
        previewOnly: true,
      }),
      preview,
    });
    return;
  }

  await addRecords(client, args.domain, [record], {
    shopperId: args.shopperId,
  });

  const updatedRecords = await listRecords(client, args.domain, {
    shopperId: args.shopperId,
  });
  const matches = updatedRecords.filter((item) => isSameRecord(item, record));

  outputJson({
    metadata: buildMetadata(resolved.name, '/create-record', {
      baseUrl: client.baseUrl,
      changed: true,
    }),
    preview,
    result: {
      changed: true,
      matches: matches.map(normalizeRecord),
    },
  });
}

function buildRecord(args) {
  const type = String(args.type).toUpperCase();
  const record = compactObject({
    type,
    name: args.name,
    data: args.data,
    ttl: parseOptionalInteger(args.ttl, '--ttl'),
    priority: parseOptionalInteger(args.priority, '--priority'),
    service: args.service,
    protocol: args.protocol,
    weight: parseOptionalInteger(args.weight, '--weight'),
    port: parseOptionalInteger(args.port, '--port'),
  });

  if (type === 'MX' && record.priority === undefined) {
    throw new SkillError('GODADDY_ARGS_INVALID', 'MX records require --priority');
  }

  if (type === 'SRV') {
    const missing = ['service', 'protocol', 'port', 'priority', 'weight'].filter(
      (field) => record[field] === undefined
    );

    if (missing.length > 0) {
      throw new SkillError('GODADDY_ARGS_INVALID', `SRV records require ${missing.map((field) => `--${field}`).join(', ')}`);
    }
  }

  return record;
}

function isSameRecord(a, b) {
  return (
    a.type === b.type &&
    a.name === b.name &&
    a.data === b.data &&
    Number(a.ttl || 0) === Number(b.ttl || 0) &&
    Number(a.priority || 0) === Number(b.priority || 0) &&
    (a.service || '') === (b.service || '') &&
    (a.protocol || '') === (b.protocol || '') &&
    Number(a.weight || 0) === Number(b.weight || 0) &&
    Number(a.port || 0) === Number(b.port || 0)
  );
}

main().catch(outputError);
