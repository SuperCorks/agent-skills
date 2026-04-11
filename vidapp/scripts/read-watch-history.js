#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { getApiKey } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Read VidApp watch history for a specific source user id.

Usage:
  node scripts/read-watch-history.js --source-user-id USER_ID [options]

Options:
  --source-user-id <id>    Required VidApp source user id
  --page <n>               Page number (default: 1)
  --per-page <n>           Page size 1-10000 (default: 1000)
  --base-url <url>         Override API base URL
  --help                   Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.sourceUserId) {
    throw new SkillError('VIDAPP_ARGS_INVALID', '--source-user-id is required');
  }

  const page = args.page ? validateInteger(args.page, '--page', 1, undefined) : 1;
  const perPage = args.perPage ? validateInteger(args.perPage, '--per-page', 1, 10000) : 1000;

  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });
  const watchHistory = await request(client, `/users/${encodeURIComponent(args.sourceUserId)}/watch-history`, {
    query: {
      page,
      per_page: perPage,
    },
  });

  outputJson({
    metadata: buildMetadata(`/users/${args.sourceUserId}/watch-history`, {
      sourceUserId: args.sourceUserId,
      page,
      perPage,
    }),
    watchHistory,
  });
}

function validateInteger(value, flagName, min, max) {
  const parsed = parseInteger(value, flagName, { min, max });
  if (!parsed.valid) {
    throw new SkillError('VIDAPP_ARGS_INVALID', parsed.message);
  }
  return parsed.value;
}

main().catch(outputError);