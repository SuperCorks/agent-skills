#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { getApiKey, resolveAppId } = require('../lib/auth');
const { createClient, request } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');

const HELP = `
Verify VidApp API access and summarize the available API surface.

Usage:
  node scripts/verify-access.js [options]

Options:
  --app-id <id>         Optional app id for a tiny purchases probe
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const client = createClient(getApiKey(), { baseUrl: args.baseUrl });

  const health = await request(client, '/health');
  const openApi = await request(client, '/openapi.json');

  const result = {
    metadata: buildMetadata('/health + /openapi.json', {
      appId: args.appId || process.env.VIDAPP_APP_ID || null,
    }),
    health,
    openApi: {
      title: openApi?.info?.title || null,
      version: openApi?.info?.version || null,
      pathCount: openApi?.paths ? Object.keys(openApi.paths).length : 0,
      tags: collectTags(openApi),
    },
  };

  const appId = args.appId || process.env.VIDAPP_APP_ID;
  if (appId) {
    const resolvedAppId = resolveAppId(appId);
    const probe = await request(client, `/analytics/${resolvedAppId}/purchases`, {
      query: { page_size: 1 },
    });

    result.purchasesProbe = {
      appId: resolvedAppId,
      page: probe?.Page ?? null,
      totalItems: probe?.TotalItems ?? null,
      totalPages: probe?.TotalPages ?? null,
      sampleKeys: probe?.Purchases?.[0] ? Object.keys(probe.Purchases[0]) : [],
    };
  }

  outputJson(result);
}

function collectTags(openApi) {
  const tags = new Set();

  for (const methods of Object.values(openApi?.paths || {})) {
    for (const operation of Object.values(methods || {})) {
      for (const tag of operation?.tags || []) {
        tags.add(tag);
      }
    }
  }

  return [...tags].sort();
}

main().catch(outputError);