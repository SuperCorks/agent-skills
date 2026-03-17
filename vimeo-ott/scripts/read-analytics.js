#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const VIDEO_TYPES = new Set(['video', 'video.platforms', 'video.geography', 'video.subtitles']);

const HELP = `
Read a Vimeo OTT analytics report.

Usage:
  node scripts/read-analytics.js --type TYPE [options]

Options:
  --type <type>         traffic, income_statement, units, subscribers, churn,
                        video, video.platforms, video.geography, or video.subtitles
  --from <value>        Start date/time or relative time (default: 1-month-ago)
  --to <value>          End date/time (default: today)
  --by <value>          hour, day, week, month, or year for time-series reports
  --video-id <id>       Required for video report types
  --per-page <n>        Page size 1-100 (default: 50)
  --account <name>      Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.type) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', '--type is required');
  }

  if (VIDEO_TYPES.has(args.type) && !args.videoId) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', `--video-id is required for ${args.type}`);
  }

  const perPage = args.perPage ? validateInteger(args.perPage, '--per-page', 1, 100) : 50;
  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });

  const report = await request(client, '/analytics', {
    query: {
      type: args.type,
      from: args.from || '1-month-ago',
      to: args.to || 'today',
      by: args.by,
      video_id: args.videoId,
      per_page: perPage,
    },
  });

  outputJson({
    metadata: buildMetadata(accountName, '/analytics', {
      type: args.type,
      from: args.from || '1-month-ago',
      to: args.to || 'today',
      by: args.by || null,
      videoId: args.videoId || null,
      perPage,
    }),
    report,
  });
}

function validateInteger(value, flagName, min, max) {
  const parsed = parseInteger(value, flagName, { min, max });
  if (!parsed.valid) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', parsed.message);
  }
  return parsed.value;
}

main().catch(outputError);