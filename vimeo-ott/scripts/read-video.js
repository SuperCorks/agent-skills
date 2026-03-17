#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { createClient, request, getPathFromIdOrHref } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Read a Vimeo OTT video and optionally fetch file renditions.

Usage:
  node scripts/read-video.js [--id ID | --href HREF] [options]

Options:
  --id <id>             Video ID
  --href <href>         Video href
  --include-files       Also fetch /files for the video
  --quality <value>     Optional file quality filter when using --include-files
  --format <value>      Optional file format filter when using --include-files
  --account <name>      Account name from VIMEO_OTT_ACCOUNTS
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if ((!args.id && !args.href) || (args.id && args.href)) {
    throw new SkillError('VIMEO_OTT_ARGS_INVALID', 'Provide exactly one of --id or --href');
  }

  const accounts = parseAccounts(process.env.VIMEO_OTT_ACCOUNTS);
  const { name: accountName, apiKey } = resolveAccount(accounts, args.account);
  const client = createClient(apiKey, { baseUrl: args.baseUrl });
  const videoPath = getPathFromIdOrHref('videos', args.href || args.id);

  const result = {
    metadata: buildMetadata(accountName, videoPath),
    video: await request(client, videoPath),
  };

  if (args.includeFiles) {
    result.files = await request(client, `${videoPath}/files`, {
      query: {
        quality: args.quality,
        format: args.format,
      },
    });
  }

  outputJson(result);
}

main().catch(outputError);