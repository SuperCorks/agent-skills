#!/usr/bin/env node

const { parseArgs, parseJsonFlag, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { resolveAuth } = require('../lib/auth');
const { createClient, get } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Perform a read-only GET against any Pastel API resource.

Usage:
  node scripts/get-resource.js --path PATH [options]

Options:
  --account <alias>     Account alias from PASTEL_ACCOUNTS
  --path <path>           API path such as /users/me or /canvases/CANVAS_ID/annotations
  --query-json <json>     JSON object of query parameters
  --base-url <url>        Override API base URL
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }
  if (!args.path) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Provide --path');
  }

  const query = args.queryJson ? parseJsonFlag(args.queryJson, '--query-json') : undefined;
  if (query !== undefined && (typeof query !== 'object' || query === null || Array.isArray(query))) {
    throw new SkillError('PASTEL_ARGS_INVALID', '--query-json must be a JSON object');
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const resource = await get(client, args.path, { query });

  outputJson({
    metadata: buildMetadata('get-resource', { account: auth.name, path: args.path, query: query || null }),
    resource,
  });
}

main().catch(outputError);
