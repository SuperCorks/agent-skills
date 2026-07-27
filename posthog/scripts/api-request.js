#!/usr/bin/env node

const {
  getConfiguredAccounts,
  resolveAccount,
  resolveProjectId,
} = require('../lib/accounts');
const {
  parseArgs,
  parseMethod,
  readJsonInput,
  assertObject,
  printHelp,
  outputJson,
  outputError,
} = require('../lib/cli');
const { createClient, request, resolveApiPath } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');
const { SkillError } = require('../lib/errors');

const HELP = `
Call an authenticated PostHog private API route.

Usage:
  node scripts/api-request.js --path <path> [options]

Options:
  --path <path>        Project-relative resource or absolute /api/... path
  --method <method>    GET, HEAD, POST, PUT, PATCH, or DELETE (default: GET)
  --query-json <json>  URL query parameters as a JSON object
  --query-file <path>  File containing URL query parameters
  --body-json <json>   JSON request body
  --body-file <path>   File containing the JSON request body
  --account <name>     Account alias from POSTHOG_ACCOUNTS
  --project <id>       Override the account's default project
  --host <url>         Override the account's private API host
  --confirm            Execute a non-read request; otherwise show a preview
  --help               Show this help

Examples:
  node scripts/api-request.js --account work --path feature_flags/
  node scripts/api-request.js --account work --path experiments/ --query-json '{"limit":20}'
  node scripts/api-request.js --account work --path feature_flags/ --method POST --body-file ./flag.json
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
    return;
  }

  const method = parseMethod(args.method);
  const account = resolveAccount(getConfiguredAccounts(), args.account);
  const projectId = resolveProjectId(account, args.project, false);
  const client = createClient(account, { host: args.host });
  const path = resolveApiPath(args.path, projectId);
  const query = readJsonInput({
    json: args.queryJson,
    file: args.queryFile,
    label: 'query',
  });
  const body = readJsonInput({
    json: args.bodyJson,
    file: args.bodyFile,
    label: 'body',
  });

  if (query !== undefined) {
    assertObject(query, 'Query parameters');
  }
  if (['GET', 'HEAD'].includes(method) && body !== undefined) {
    throw new SkillError('POSTHOG_ARGS_INVALID', `${method} requests cannot include a body`);
  }

  const requestSummary = {
    method,
    path,
    query: query || null,
    body: body === undefined ? null : body,
  };

  if (!['GET', 'HEAD'].includes(method) && !args.confirm) {
    outputJson({
      metadata: buildMetadata(account.name, client, { projectId, path, method }),
      preview: requestSummary,
      requiresConfirm: true,
      message: 'Review the request, then rerun with --confirm to execute it.',
    });
    return;
  }

  const result = await request(client, path, {
    method,
    query,
    body,
    retries: ['GET', 'HEAD'].includes(method) ? 2 : 0,
  });

  outputJson({
    metadata: buildMetadata(account.name, client, { projectId, path, method }),
    request: {
      method,
      path,
      query: query || null,
    },
    result,
  });
}

main().catch(outputError);
