#!/usr/bin/env node

const { parseArgs, parseInteger, parseJsonFlag, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { resolveAuth } = require('../lib/auth');
const { createClient, get } = require('../lib/client');
const { buildMetadata, normalizeCanvas, extractArray } = require('../lib/normalizer');

const HELP = `
List Pastel canvases visible to the API token.

Usage:
  node scripts/list-canvases.js [options]

Options:
  --account <alias>       Account alias from PASTEL_ACCOUNTS
  --limit <n>             Page size, default 100
  --offset <n>            Starting offset, default 0
  --all                   Fetch pages until a short page is returned
  --filters-json <json>   JSON object sent as Pastel's filters query param
  --raw                   Return raw Pastel canvas objects
  --base-url <url>        Override API base URL
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const limit = parseNumberArg(args.limit ?? 100, '--limit', { min: 1, max: 500 });
  const offset = parseNumberArg(args.offset ?? 0, '--offset', { min: 0 });
  const filters = args.filtersJson ? parseJsonFlag(args.filtersJson, '--filters-json') : null;
  if (filters !== null && (typeof filters !== 'object' || Array.isArray(filters))) {
    throw new SkillError('PASTEL_ARGS_INVALID', '--filters-json must be a JSON object');
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const canvases = args.all
    ? await fetchAllCanvases(client, { limit, offset, filters })
    : await fetchCanvasPage(client, { limit, offset, filters });

  outputJson({
    metadata: buildMetadata('list-canvases', {
      account: auth.name,
      count: canvases.length,
      limit,
      offset,
      all: Boolean(args.all),
      filters,
    }),
    canvases: args.raw ? canvases : canvases.map(normalizeCanvas),
  });
}

async function fetchAllCanvases(client, { limit, offset, filters }) {
  const canvases = [];
  let nextOffset = offset;

  for (;;) {
    const page = await fetchCanvasPage(client, { limit, offset: nextOffset, filters });
    canvases.push(...page);
    if (page.length < limit) {
      break;
    }
    nextOffset += limit;
  }

  return canvases;
}

async function fetchCanvasPage(client, { limit, offset, filters }) {
  const query = { limit, offset };
  if (filters) {
    query.filters = JSON.stringify(filters);
  }
  const body = await get(client, '/users/me/canvases', { query });
  return extractArray(body, ['canvases']);
}

function parseNumberArg(value, flagName, range) {
  const parsed = parseInteger(value, flagName, range);
  if (!parsed.valid) {
    throw new SkillError('PASTEL_ARGS_INVALID', parsed.message);
  }
  return parsed.value;
}

main().catch(outputError);
