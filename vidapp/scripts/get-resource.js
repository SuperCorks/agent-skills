#!/usr/bin/env node

const { parseArgs, parseJsonFlag, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { getApiKey } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Perform a read-only GET against any VidApp API resource.

Usage:
  node scripts/get-resource.js [--path PATH | --href HREF] [options]

Options:
  --path <path>           API path such as /analytics/Yogaworks/purchases
  --href <href>           Full URL such as https://api.vidapp.com/openapi.json
  --query-json <json>     JSON object of query parameters
  --base-url <url>        Override API base URL
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.path && !args.href) || (args.path && args.href)) {
    throw new SkillError('VIDAPP_ARGS_INVALID', 'Provide exactly one of --path or --href');
  }

  const query = args.queryJson ? parseJsonFlag(args.queryJson, '--query-json') : undefined;
  if (query !== undefined && (typeof query !== 'object' || query === null || Array.isArray(query))) {
    throw new SkillError('VIDAPP_ARGS_INVALID', '--query-json must be a JSON object');
  }

  const target = args.href || args.path;
  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });
  const resource = await request(client, target, { query });

  outputJson({
    metadata: buildMetadata(target, { query: query || null }),
    resource,
  });
}

main().catch(outputError);