#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { getApiKey, resolveAppId } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Read a VidApp content collection and its items.

Usage:
  node scripts/read-collection.js --collection-id ID [options]

Options:
  --collection-id <id>   Required collection id
  --app-id <id>          VidApp app id or set VIDAPP_APP_ID
  --base-url <url>       Override API base URL
  --help                 Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.collectionId) {
    throw new SkillError('VIDAPP_ARGS_INVALID', '--collection-id is required');
  }

  const appId = resolveAppId(args.appId);
  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });
  const collection = await request(client, `/content/${appId}/collection/${args.collectionId}`);

  outputJson({
    metadata: buildMetadata(`/content/${appId}/collection/${args.collectionId}`, {
      appId,
      collectionId: args.collectionId,
    }),
    collection,
  });
}

main().catch(outputError);