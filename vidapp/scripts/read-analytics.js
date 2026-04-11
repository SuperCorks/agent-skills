#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { getApiKey, resolveAppId } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata, getDefaultThirtyDayWindow } = require('../lib/normalizer');

const TYPES = new Set(['videos', 'live-events', 'purchases']);

const HELP = `
Read VidApp analytics for videos, live-events, or purchases.

Usage:
  node scripts/read-analytics.js --type TYPE [options]

Options:
  --type <type>            videos, live-events, or purchases
  --app-id <id>            VidApp app id or set VIDAPP_APP_ID
  --start-date <date>      Required or defaulted for videos/live-events (YYYY-MM-DD)
  --end-date <date>        Required or defaulted for videos/live-events (YYYY-MM-DD)
  --query <value>          Purchases only: search by purchaser email
  --status <value>         Purchases only: Trial, Active, Expired, or comma-separated set
  --platform <value>       Purchases only: Apple, Android, AppleTV, etc.
  --store-product-id <id>  Purchases only: filter by store product id
  --page <n>               Purchases only: page number (default: 1)
  --page-size <n>          Purchases only: page size 1-1000 (default: 100)
  --base-url <url>         Override API base URL
  --help                   Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  if (!args.type || !TYPES.has(args.type)) {
    throw new SkillError('VIDAPP_ARGS_INVALID', '--type must be one of videos, live-events, or purchases');
  }

  const appId = resolveAppId(args.appId);
  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });

  if (args.type === 'purchases') {
    const page = args.page ? validateInteger(args.page, '--page', 1, undefined) : 1;
    const pageSize = args.pageSize ? validateInteger(args.pageSize, '--page-size', 1, 1000) : 100;
    const purchases = await request(client, `/analytics/${appId}/purchases`, {
      query: {
        query: args.query,
        status: args.status,
        platform: args.platform,
        store_product_id: args.storeProductId,
        page,
        page_size: pageSize,
      },
    });

    outputJson({
      metadata: buildMetadata(`/analytics/${appId}/purchases`, {
        appId,
        page,
        pageSize,
        query: args.query || null,
        status: args.status || null,
        platform: args.platform || null,
        storeProductId: args.storeProductId || null,
      }),
      analytics: purchases,
    });
    return;
  }

  const defaultWindow = getDefaultThirtyDayWindow();
  const startDate = args.startDate || defaultWindow.startDate;
  const endDate = args.endDate || defaultWindow.endDate;

  const analytics = await request(client, `/analytics/${appId}/${args.type}`, {
    query: {
      start_date: startDate,
      end_date: endDate,
    },
  });

  outputJson({
    metadata: buildMetadata(`/analytics/${appId}/${args.type}`, {
      appId,
      startDate,
      endDate,
    }),
    analytics,
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