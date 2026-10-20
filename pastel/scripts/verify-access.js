#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { resolveAuth } = require('../lib/auth');
const { createClient, get } = require('../lib/client');
const { buildMetadata, normalizeCanvas, extractArray } = require('../lib/normalizer');

const HELP = `
Verify Pastel API access with the configured token/account.

Usage:
  node scripts/verify-access.js [options]

Options:
  --account <alias>     Account alias from PASTEL_ACCOUNTS
  --base-url <url>        Override API base URL
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const user = await get(client, '/users/me');
  const canvasBody = await get(client, '/users/me/canvases', { query: { limit: 1, offset: 0 } });
  const canvases = extractArray(canvasBody, ['canvases']);

  outputJson({
    metadata: buildMetadata('verify-access', {
      account: auth.name,
      baseUrl: client.baseUrl,
    }),
    user: normalizeUser(user),
    sampleCanvases: canvases.map(normalizeCanvas),
    ok: true,
  });
}

function normalizeUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    name: user.name || null,
    role: user.role || null,
    TeamId: user.TeamId || user.Team?.id || null,
    teamName: user.Team?.name || null,
    planId: user.Customer?.planId || user.Team?.Customer?.planId || null,
  };
}

main().catch(outputError);
