#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { resolveAuth } = require('../lib/auth');
const { createClient, get } = require('../lib/client');
const { buildMetadata, normalizeCanvas, extractArray } = require('../lib/normalizer');
const { describeToken, DEFAULT_WARN_DAYS } = require('../lib/token-info');
const { SkillError } = require('../lib/errors');

const HELP = `
Verify Pastel API access with the configured token/account, and report when the token expires.

Usage:
  node scripts/verify-access.js [options]

Options:
  --account <alias>       Account alias from PASTEL_ACCOUNTS
  --base-url <url>        Override API base URL
  --warn-days <n>         Warn when the token expires within n days (default ${DEFAULT_WARN_DAYS})
  --help                  Show this help message

Exit code is 0 when the token works and is not expiring, 2 when it works but is legacy,
expiring within --warn-days, or of unknown expiry, and 1 on any error.
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const warnDays = args.warnDays === undefined ? DEFAULT_WARN_DAYS : Number(args.warnDays);
  if (!Number.isFinite(warnDays) || warnDays < 0) {
    throw new SkillError('PASTEL_ARGS_INVALID', '--warn-days must be a non-negative number');
  }

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });

  // GET /users/me was retired by Pastel ("Unknown API method"); the canvas list proves access.
  const canvasBody = await get(client, '/users/me/canvases', { query: { limit: 1, offset: 0 } });
  const canvases = extractArray(canvasBody, ['canvases']);

  let records = null;
  let listingError = null;
  try {
    records = extractArray(await get(client, '/users/me/access-tokens'), ['accessTokens', 'tokens']);
  } catch (error) {
    listingError = error.message;
  }

  const token = describeToken(auth.apiToken, records, { warnDays });
  if (listingError && token.kind === 'access') {
    token.warnings.push(`Could not read GET /users/me/access-tokens: ${listingError}`);
  }

  outputJson({
    metadata: buildMetadata('verify-access', {
      account: auth.name,
      baseUrl: client.baseUrl,
    }),
    token,
    sampleCanvases: canvases.map(normalizeCanvas),
    ok: true,
  });

  if (token.status !== 'ok') {
    for (const warning of token.warnings) process.stderr.write(`warning: ${warning}\n`);
    process.exitCode = 2;
  }
}

main().catch(outputError);
