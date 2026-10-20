#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { resolveAuth } = require('../lib/auth');
const { createClient } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');
const {
  fetchCanvasByUrl,
  fetchAnnotations,
  listVersions,
  nextVersionName,
  summarizeVersions,
} = require('../lib/canvas');

const HELP = `
List a canvas's versions (Pastel calls them revisions) with comment counts by status.

Usage:
  node scripts/list-versions.js --canvas-url PASTEL_URL [options]

Options:
  --account <alias>     Account alias from PASTEL_ACCOUNTS
  --canvas-url <url>    Canvas share link, e.g. https://usepastel.com/link/abc123
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const { canvas } = await fetchCanvasByUrl(client, args.canvasUrl || args.url || args._[0]);
  const versions = listVersions(canvas);
  const annotations = await fetchAnnotations(client, canvas.id);

  outputJson({
    metadata: buildMetadata('list-versions', { account: auth.name, canvasId: canvas.id }),
    canvas: { id: canvas.id, name: canvas.title || canvas.name || null, url: canvas.localUrl || null },
    versions: summarizeVersions(versions, annotations),
    latestVersionId: versions.length ? versions[versions.length - 1].id : null,
    suggestedNextName: nextVersionName(versions),
  });
}

main().catch(outputError);
