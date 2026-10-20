#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { resolveAuth } = require('../lib/auth');
const { createClient, send } = require('../lib/client');
const { buildMetadata } = require('../lib/normalizer');
const {
  OPEN_STATUSES,
  STATUS_LABELS,
  parseStatus,
  fetchCanvasByUrl,
  fetchAnnotations,
  parseList,
} = require('../lib/canvas');

const HELP = `
Set the status of Pastel comments: active, in-progress, in-review, or resolved.
This writes to Pastel and reviewers see it. Run it only when the user asked for it.

Usage:
  node scripts/set-status.js --canvas-url PASTEL_URL --status STATUS --numbers 34,35 [options]
  node scripts/set-status.js --canvas-url PASTEL_URL --status resolved --open [options]

Options:
  --account <alias>     Account alias from PASTEL_ACCOUNTS
  --canvas-url <url>    Canvas share link, e.g. https://usepastel.com/link/abc123
  --status <status>     active | in-progress | in-review | resolved
  --numbers <list>      Comment numbers as shown in Pastel (#34), comma-separated
  --ids <list>          Annotation ids, comma-separated
  --open                Every comment that is not resolved (Pastel's default filter)
  --from <list>         Only comments currently in these statuses, e.g. active,in-progress
  --dry-run             Show what would change, without changing it
  --base-url <url>      Override API base URL
  --help                Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }
  if (!args.status || args.status === true) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Provide --status');
  }
  const status = parseStatus(args.status);
  const numbers = parseList(args.numbers).map(Number);
  const ids = parseList(args.ids).map(Number);
  if ([numbers.length > 0, ids.length > 0, Boolean(args.open)].filter(Boolean).length !== 1) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Choose the comments with exactly one of --numbers, --ids, or --open');
  }
  const from = args.from ? parseList(args.from).map(parseStatus) : args.open ? OPEN_STATUSES : null;

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const { canvas } = await fetchCanvasByUrl(client, args.canvasUrl || args.url || args._[0]);
  const annotations = await fetchAnnotations(client, canvas.id);

  const selected = annotations.filter((annotation) =>
    numbers.length ? numbers.includes(annotation.number)
      : ids.length ? ids.includes(annotation.id)
        : true);
  const missing = numbers.length
    ? numbers.filter((number) => !selected.some((annotation) => annotation.number === number))
    : ids.filter((id) => !selected.some((annotation) => annotation.id === id));
  if (missing.length) {
    throw new SkillError('PASTEL_COMMENT_NOT_FOUND', `Not on this canvas: ${missing.join(', ')}`);
  }

  const targets = selected
    .filter((annotation) => !from || from.includes(annotation.status))
    .sort((left, right) => left.number - right.number);
  const results = [];
  for (const annotation of targets) {
    const entry = {
      number: annotation.number,
      id: annotation.id,
      from: annotation.status,
      to: status,
      url: annotation.fullCommentUrl || null,
    };
    if (annotation.status === status) {
      results.push({ ...entry, action: 'unchanged' });
      continue;
    }
    if (args.dryRun) {
      results.push({ ...entry, action: 'would-change' });
      continue;
    }
    const updated = await send(client, `/annotations/${annotation.id}`, {
      method: 'PUT',
      body: { id: annotation.id, status },
    });
    results.push({ ...entry, to: updated.status, action: updated.status === status ? 'changed' : 'unexpected' });
  }

  outputJson({
    metadata: buildMetadata('set-status', {
      account: auth.name,
      canvasId: canvas.id,
      status,
      statusLabel: STATUS_LABELS[status],
      dryRun: Boolean(args.dryRun),
    }),
    results,
  });
}

main().catch(outputError);
