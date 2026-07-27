#!/usr/bin/env node

const {
  getConfiguredAccounts,
  resolveAccount,
  resolveProjectId,
} = require('../lib/accounts');
const {
  parseArgs,
  readJsonInput,
  assertObject,
  printHelp,
  outputJson,
  outputError,
} = require('../lib/cli');
const { createClient, queryProject } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');
const { SkillError } = require('../lib/errors');

const HELP = `
Run a HogQL or Query API query in a selected PostHog project.

Usage:
  node scripts/query.js --hogql <sql> [options]
  node scripts/query.js --query-json <json> [options]
  node scripts/query.js --query-file <path> [options]

Options:
  --hogql <sql>        HogQL statement
  --query-json <json>  Query node JSON, such as a TrendsQuery
  --query-file <path>  File containing a query node
  --name <text>        Descriptive query-log name
  --account <name>     Account alias from POSTHOG_ACCOUNTS
  --project <id>       Override the account's default project
  --host <url>         Override the account's private API host
  --help               Show this help
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
    return;
  }

  const hasHogql = args.hogql !== undefined;
  const hasQueryNode = args.queryJson !== undefined || args.queryFile !== undefined;
  if (hasHogql === hasQueryNode) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      'Provide exactly one of --hogql, --query-json, or --query-file'
    );
  }

  const account = resolveAccount(getConfiguredAccounts(), args.account);
  const projectId = resolveProjectId(account, args.project);
  const client = createClient(account, { host: args.host });

  let query;
  if (hasHogql) {
    const statement = String(args.hogql).trim();
    if (!statement) {
      throw new SkillError('POSTHOG_ARGS_INVALID', '--hogql cannot be empty');
    }
    query = {
      kind: 'HogQLQuery',
      query: statement,
    };
  } else {
    query = assertObject(
      readJsonInput({
        json: args.queryJson,
        file: args.queryFile,
        label: 'query',
        required: true,
      }),
      'Query node'
    );
  }

  const name = args.name
    ? String(args.name).trim()
    : hasHogql
      ? 'PostHog skill HogQL query'
      : `PostHog skill ${query.kind || 'Query API'} query`;

  if (!name) {
    throw new SkillError('POSTHOG_ARGS_INVALID', '--name cannot be empty');
  }

  const path = `/api/projects/${encodeURIComponent(projectId)}/query/`;
  const result = await queryProject(client, projectId, { query, name });

  outputJson({
    metadata: buildMetadata(account.name, client, {
      projectId,
      path,
      method: 'POST',
    }),
    query: {
      name,
      kind: query.kind || null,
    },
    result,
  });
}

main().catch(outputError);
