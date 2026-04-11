#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { getApiKey } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Read current VidApp user tags or user tag history.

Usage:
  node scripts/read-user-tags.js --user-id USER_ID [options]

Options:
  --user-id <id>         Required VidApp user id
  --history              Read /api/user-tags/history instead of /api/user-tags
  --tag <name>           History only: filter by tag name
  --category <value>     History only: filter by category
  --from-date <date>     History only: YYYY-MM-DD
  --to-date <date>       History only: YYYY-MM-DD
  --limit <n>            History only: 1-100 (default: 50)
  --offset <n>           History only: default 0
  --base-url <url>       Override API base URL
  --help                 Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.userId) {
    throw new SkillError('VIDAPP_ARGS_INVALID', '--user-id is required');
  }

  const path = args.history ? '/api/user-tags/history' : '/api/user-tags';
  const limit = args.limit ? validateInteger(args.limit, '--limit', 1, 100) : 50;
  const offset = args.offset ? validateInteger(args.offset, '--offset', 0, undefined) : 0;

  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });
  const response = await request(client, path, {
    query: {
      user_id: args.userId,
      tag: args.tag,
      category: args.category,
      from_date: args.fromDate,
      to_date: args.toDate,
      limit: args.history ? limit : undefined,
      offset: args.history ? offset : undefined,
    },
  });

  outputJson({
    metadata: buildMetadata(path, {
      userId: args.userId,
      history: Boolean(args.history),
      tag: args.tag || null,
      category: args.category || null,
      fromDate: args.fromDate || null,
      toDate: args.toDate || null,
      limit: args.history ? limit : null,
      offset: args.history ? offset : null,
    }),
    userTags: response,
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