#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { resolveAuth } = require('../lib/auth');
const { createClient, send } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');
const { fetchCanvasByUrl, listVersions, nextVersionName } = require('../lib/canvas');

const HELP = `
Start a new version of a canvas (Pastel's "New version"), the next round of review.
This writes to Pastel: everyone on the canvas sees the new version. Run it only
when the user asked for it.

Usage:
  node scripts/create-version.js --canvas-url PASTEL_URL [--name NAME] [options]

Options:
  --account <alias>          Account alias from PASTEL_ACCOUNTS
  --canvas-url <url>         Canvas share link, e.g. https://usepastel.com/link/abc123
  --name <name>              Version name. Default: the next in the canvas's scheme ("2.0" -> "3.0")
  --dry-run                  Show the version that would be created, without creating it
  --allow-duplicate-name     Allow a name an existing version already has
  --force                    Create even if a version was created in the last 2 minutes
  --base-url <url>           Override API base URL
  --help                     Show this help message
`;

const RECENT_MS = 2 * 60 * 1000;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const { canvas } = await fetchCanvasByUrl(client, args.canvasUrl || args.url || args._[0]);
  const versions = listVersions(canvas);
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : nextVersionName(versions);
  const latest = versions[versions.length - 1] || null;

  if (!args.allowDuplicateName && versions.some((version) => version.name === name)) {
    throw new SkillError('PASTEL_VERSION_EXISTS', `Version "${name}" already exists on this canvas`);
  }
  // Pastel accepts repeated submits; a double click once left two "2.0" versions.
  if (!args.force && latest?.createdAt && Date.now() - new Date(latest.createdAt).getTime() < RECENT_MS) {
    throw new SkillError('PASTEL_VERSION_TOO_SOON', `Version "${latest.name}" was created at ${latest.createdAt}`);
  }

  const plan = { CanvasId: canvas.id, name };
  if (args.dryRun) {
    outputJson({
      metadata: buildMetadata('create-version', { account: auth.name, dryRun: true }),
      wouldCreate: plan,
      latest: latest ? { id: latest.id, number: latest.number, name: latest.name } : null,
    });
    return;
  }

  // The web app also sends the viewer's proxy cookies and credentials; both
  // are null outside a password-protected site session.
  const created = await send(client, `/canvases/${encodeURIComponent(canvas.id)}/revisions`, {
    method: 'POST',
    body: { ...plan, cookies: null, credentials: null },
  });

  outputJson({
    metadata: buildMetadata('create-version', { account: auth.name, dryRun: false }),
    created: { id: created.id, number: created.number, name: created.name, createdAt: created.createdAt },
    previous: latest ? { id: latest.id, number: latest.number, name: latest.name } : null,
  });
}

main().catch(outputError);
