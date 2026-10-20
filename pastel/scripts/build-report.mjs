#!/usr/bin/env node
/*
 * Assemble the feedback-round report from a review folder:
 *
 *   review/
 *     comments.json        read-comments.js output (JSON)
 *     media/media.json     download-media.js output
 *     before/capture.json  capture.mjs --label before
 *     after/capture.json   capture.mjs --label after
 *     changes.json         what was done, written during the round
 *
 * The report is an html-report-builder findings report (internal by default)
 * built only from its documented components; this script never writes CSS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HELP = `
Build the before/after report for a Pastel feedback round.

Usage:
  node scripts/build-report.mjs --dir REVIEW_DIR --out path/to/report.html [options]

Options:
  --dir <dir>        Review folder (comments.json, media/, before/, after/, changes.json)
  --out <file>       Report path; images go to <name>.assets/ beside it
  --build            Then run html-report-builder's build (refreshes runtime, inlines images, validates)
  --brand <file>     Kernel brand kit JSON passed to that build
  --hrb <dir>        html-report-builder folder. Default: the sibling skill folder
  --help             Show this help message

changes.json (see references/report.md):
  { "title": "...", "lede": "...", "canvasUrl": "...", "version": "3.0",
    "audience": "internal", "links": [{ "label": "PR #82", "url": "..." }],
    "decisions": [{ "question": "...?", "context": "...", "answer": "...", "by": "Simon" }],
    "comments": [{ "number": 38, "title": "...", "outcome": "changed", "change": "...",
                   "files": ["src/app/globals.css"], "note": "..." }],
    "next": ["..."], "verification": ["..."] }
`;

export const OUTCOMES = {
  changed: { label: 'Changed', tone: 'ok' },
  'already-done': { label: 'Already done', tone: 'info' },
  partial: { label: 'Partly changed', tone: 'warn' },
  'needs-decision': { label: 'Needs a decision', tone: 'warn' },
  'not-changed': { label: 'Not changed', tone: '' },
};

const STATUS_LABELS = {
  active: 'Active',
  'in-progress': 'In progress',
  'in-review': 'In review',
  resolved: 'Resolved',
};

const MAX_INLINE_BYTES = 300 * 1024;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escaped text with `code`, **bold**, and [label](https://link) allowed. */
export function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');
}

function excerpt(value, length = 140) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pageLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url || '';
  }
}

function figure(src, alt, caption) {
  return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function reviewerImages(entry) {
  const images = entry.media.filter((item) => item.src && /\.(jpe?g|png|webp|gif)$/i.test(item.src));
  const files = entry.media.filter((item) => item.src && !images.includes(item));
  const parts = [];
  if (images.length === 1) {
    parts.push(figure(images[0].src, `${images[0].label} for comment ${entry.number}`, images[0].label));
  } else if (images.length > 1) {
    parts.push(`<div class="shots">${images.map((item) => figure(item.src, `${item.label} for comment ${entry.number}`, item.label)).join('')}</div>`);
  }
  if (files.length) {
    parts.push(`<p>Attached: ${files.map((item) => `<a href="${escapeHtml(item.src)}">${escapeHtml(item.label)}</a>`).join(', ')}</p>`);
  }
  return parts.join('\n    ');
}

function compareBlock(entry) {
  const side = (kind, shot, reason) => {
    if (shot?.src) {
      return `<figure class="${kind}"><img src="${escapeHtml(shot.src)}" alt="${kind === 'before' ? 'Before' : 'After'} the change for comment ${entry.number}">${shot.caption ? `<figcaption>${escapeHtml(shot.caption)}</figcaption>` : ''}</figure>`;
    }
    return `<figure class="${kind}"><p class="muted">${escapeHtml(reason)}</p></figure>`;
  };
  if (!entry.before?.src && !entry.after?.src && entry.outcome !== 'changed' && entry.outcome !== 'partial') {
    return '';
  }
  return `<div class="compare">
      ${side('before', entry.before, entry.before?.missing || 'No before screenshot.')}
      ${side('after', entry.after, entry.after?.missing || 'No after screenshot.')}
    </div>`;
}

function commentCard(entry, audience) {
  const outcome = OUTCOMES[entry.outcome] || OUTCOMES['not-changed'];
  const number = entry.url ? `<a href="${escapeHtml(entry.url)}">#${entry.number}</a>` : `#${entry.number}`;
  const byline = [entry.author, formatDate(entry.createdAt)].filter(Boolean).join(' · ');
  const page = entry.pageUrl ? ` · <a href="${escapeHtml(entry.pageUrl)}">${escapeHtml(pageLabel(entry.pageUrl))}</a>` : '';
  const status = entry.status ? ` <span class="pill">${escapeHtml(STATUS_LABELS[entry.status] || entry.status)} in Pastel</span>` : '';
  const replies = (entry.replies || [])
    .filter((reply) => reply.comment)
    .map((reply) => `<p><small>${escapeHtml(reply.userName || 'Reply')}:</small> ${inline(reply.comment)}</p>`)
    .join('');
  const lines = [
    `<article class="card wide" id="c${entry.number}">`,
    `    <h3>${number} ${escapeHtml(entry.title || excerpt(entry.comment, 70))}</h3>`,
    `    <p><span class="pill ${outcome.tone}">${outcome.label}</span>${status} <small>${escapeHtml(byline)}${page}</small></p>`,
    `    <div class="callout"><p><b>Comment:</b> ${inline(entry.comment || '(no text; see the screenshot)')}</p>${replies}</div>`,
  ];
  const images = reviewerImages(entry);
  if (images) lines.push(`    ${images}`);
  if (entry.change) lines.push(`    <p><b>${entry.outcome === 'changed' || entry.outcome === 'partial' ? 'Change' : 'Response'}:</b> ${inline(entry.change)}</p>`);
  if (audience === 'internal' && entry.files?.length) {
    lines.push(`    <ul class="chips">${entry.files.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join('')}</ul>`);
  }
  const compare = compareBlock(entry);
  if (compare) lines.push(`    ${compare}`);
  if (audience === 'internal' && entry.note) lines.push(`    <p class="muted">${inline(entry.note)}</p>`);
  lines.push('  </article>');
  return lines.join('\n');
}

/** Pure: the report HTML for an assembled round. */
export function renderReport(round) {
  const audience = round.audience === 'client' ? 'client' : 'internal';
  const entries = round.entries;
  const count = (keys) => entries.filter((entry) => keys.includes(entry.outcome)).length;
  const changed = count(['changed']);
  const done = count(['already-done']);
  const attention = count(['partial', 'needs-decision', 'not-changed']);
  const reviewers = [...new Set(entries.map((entry) => entry.author).filter(Boolean))];

  const meta = [
    round.canvasName || round.canvasUrl
      ? ['Canvas', round.canvasUrl ? `<a href="${escapeHtml(round.canvasUrl)}">${escapeHtml(round.canvasName || 'Pastel canvas')}</a>` : escapeHtml(round.canvasName)]
      : null,
    round.version ? ['Version', escapeHtml(round.version)] : null,
    reviewers.length ? ['Reviewer', escapeHtml(reviewers.join(', '))] : null,
    ['Updated', escapeHtml(round.date)],
    ...(audience === 'internal' ? (round.links || []).map((link) => [escapeHtml(link.kind || 'Link'), `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label || link.url)}</a>`]) : []),
  ].filter(Boolean);

  const rows = entries.map((entry) => {
    const outcome = OUTCOMES[entry.outcome] || OUTCOMES['not-changed'];
    return `<tr><td><a href="#c${entry.number}">#${entry.number}</a></td><td>${escapeHtml(excerpt(entry.comment))}</td><td class="${outcome.tone}">${outcome.label}</td><td>${escapeHtml(excerpt(entry.change || '', 120))}</td></tr>`;
  });

  const decisions = (round.decisions || []).map((decision, index) => {
    const parts = [`<article class="question" id="q${index + 1}">`, `    <h3>${escapeHtml(decision.question)}</h3>`];
    if (decision.context) parts.push(`    <p>${inline(decision.context)}</p>`);
    if (decision.recommendation) parts.push(`    <p class="rec">${inline(decision.recommendation)}</p>`);
    parts.push(`    <p class="answer">${decision.answer ? `${inline(decision.answer)}${decision.by ? ` (${escapeHtml(decision.by)})` : ''}` : ''}</p>`);
    parts.push('  </article>');
    return parts.join('\n');
  });

  const method = [];
  if (round.capture.before) method.push(`Before screenshots: ${escapeHtml(round.capture.before)}.`);
  if (round.capture.after) method.push(`After screenshots: ${escapeHtml(round.capture.after)}.`);
  method.push('Each screenshot is the element the comment points at, at the reviewer’s window width, with some of the page around it.');

  return `<!doctype html>
<html lang="en" data-template="findings" data-audience="${audience}" data-kernel-kind="report" data-kernel-contract="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(round.title)}</title>
</head>
<body>
<header class="hero">
  <p class="eyebrow">Pastel feedback</p>
  <h1>${escapeHtml(round.title)}</h1>
  <p class="lede">${inline(round.lede || `${entries.length} comments addressed: ${changed} changed, ${done} already done, ${attention} need attention.`)}</p>
  <dl class="meta">${meta.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
</header>
<main>
<section id="summary" data-toc="At a glance">
  <h2>At a glance</h2>
  <div class="tiles">
    <div class="tile"><span>Comments</span><b>${entries.length}</b></div>
    <div class="tile ok"><span>Changed</span><b>${changed}</b></div>
    <div class="tile"><span>Already done</span><b>${done}</b></div>
    <div class="tile${attention ? ' warn' : ''}"><span>Need attention</span><b>${attention}</b></div>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Comment</th><th>Request</th><th>Outcome</th><th>What changed</th></tr></thead>
    <tbody>
      ${rows.join('\n      ')}
    </tbody>
  </table></div>
</section>
${decisions.length ? `<section id="decisions" data-toc="Decisions">
  <h2>Decisions made before the work</h2>
  ${decisions.join('\n  ')}
</section>
` : ''}<section id="findings" data-toc="Comments">
  <h2>Comment by comment</h2>
  <div class="grid">
  ${entries.map((entry) => commentCard(entry, audience)).join('\n  ')}
  </div>
</section>
${round.next?.length ? `<section id="next" data-toc="Next steps">
  <h2>Next steps</h2>
  <ol class="checklist">
    ${round.next.map((step) => `<li>${inline(step)}</li>`).join('\n    ')}
  </ol>
</section>
` : ''}<section id="limits" data-toc="Method">
  <h2>Method and verification</h2>
  <p>${method.join(' ')}</p>
${audience === 'internal' && round.verification?.length ? `  <ul>
    ${round.verification.map((item) => `<li>${inline(item)}</li>`).join('\n    ')}
  </ul>
` : ''}${round.warnings.length ? `  <div class="callout warn"><p><b>Screenshot warnings:</b></p><ul>${round.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>
` : ''}</section>
</main>
</body>
</html>
`;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

function hasSips() {
  return spawnSync('which', ['sips']).status === 0;
}

function pixelWidth(file) {
  const output = spawnSync('sips', ['-g', 'pixelWidth', file], { encoding: 'utf8' }).stdout || '';
  return Number(output.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
}

/**
 * Copy into the assets folder. On macOS, images wider than 1600 px or over
 * 300 KB become 1600 px JPEGs so the built report stays under about 2 MB.
 */
function copyAsset(source, assetsDir, name, shrink) {
  const target = path.join(assetsDir, name);
  fs.copyFileSync(source, target);
  if (!shrink || !/\.(jpe?g|png|webp)$/i.test(name)) return name;
  if (fs.statSync(target).size <= MAX_INLINE_BYTES && pixelWidth(target) <= 1600) return name;
  const jpeg = target.replace(/\.(png|webp|jpe?g)$/i, '.jpg');
  execFileSync('sips', ['-Z', '1600', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', target, '--out', jpeg], { stdio: 'ignore' });
  if (jpeg !== target) fs.rmSync(target);
  return path.basename(jpeg);
}

function captureSummary(manifest) {
  if (!manifest) return null;
  const where = manifest.origin || 'the reviewer’s page URLs';
  return `${where}, ${formatDate(manifest.capturedAt)}`;
}

export function assembleRound(dir, outFile) {
  const changes = readJsonIfExists(path.join(dir, 'changes.json'));
  if (!changes) throw new Error(`${dir}/changes.json is missing; see references/report.md`);
  const commentsFile = readJsonIfExists(path.join(dir, 'comments.json'));
  const comments = Array.isArray(commentsFile) ? commentsFile : commentsFile?.comments || [];
  const media = readJsonIfExists(path.join(dir, 'media', 'media.json'))?.media || {};
  const before = readJsonIfExists(path.join(dir, 'before', 'capture.json'));
  const after = readJsonIfExists(path.join(dir, 'after', 'capture.json'));

  const slug = path.basename(outFile).replace(/\.html?$/i, '');
  const assetsName = `${slug}.assets`;
  const assetsDir = path.join(path.dirname(outFile), assetsName);
  fs.mkdirSync(assetsDir, { recursive: true });
  const shrink = hasSips();
  const warnings = [];

  const shot = (manifest, folder, number) => {
    const result = manifest?.results?.find((item) => item.number === number);
    if (!result) return null;
    if (result.warning) warnings.push(`#${number} ${manifest.label}: ${result.warning}`);
    if (result.error || !result.file) return { missing: `No ${manifest.label} screenshot: ${result.error || 'not captured'}.` };
    const source = path.join(dir, folder, result.file);
    if (!fs.existsSync(source)) return { missing: `No ${manifest.label} screenshot: file missing.` };
    const file = copyAsset(source, assetsDir, `${number}-${manifest.label}.jpg`, shrink);
    return { src: `${assetsName}/${file}` };
  };

  const entries = (changes.comments || []).map((change) => {
    const comment = comments.find((item) => item.number === change.number) || {};
    const mediaItems = (media[change.number] || []).map((item) => {
      const source = path.join(dir, 'media', item.file);
      if (!fs.existsSync(source)) return { ...item, src: null };
      return { ...item, src: `${assetsName}/${copyAsset(source, assetsDir, item.file, shrink)}` };
    });
    return {
      number: change.number,
      title: change.title,
      outcome: change.outcome,
      change: change.change,
      files: change.files,
      note: change.note,
      comment: comment.comment ?? change.comment ?? '',
      replies: comment.replies || [],
      author: change.author || changes.reviewer || comment.userName || null,
      createdAt: comment.createdAt || null,
      // The status in comments.json is a snapshot from the start of the round,
      // so the card shows one only when changes.json states it.
      status: change.pastelStatus ?? changes.pastelStatus ?? null,
      url: comment.fullCommentUrl || change.url || null,
      pageUrl: comment.pageUrl || null,
      media: mediaItems,
      before: change.before === false ? null : shot(before, 'before', change.number),
      after: change.after === false ? null : shot(after, 'after', change.number),
    };
  });

  return {
    title: changes.title || 'Pastel feedback round',
    lede: changes.lede,
    audience: changes.audience || 'internal',
    canvasName: changes.canvasName,
    canvasUrl: changes.canvasUrl,
    version: changes.version,
    date: changes.date || formatDate(new Date()),
    links: changes.links,
    decisions: changes.decisions,
    next: changes.next,
    verification: changes.verification,
    capture: { before: changes.beforeSource || captureSummary(before), after: changes.afterSource || captureSummary(after) },
    entries,
    warnings,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }
  if (!args.dir || !args.out) {
    console.error('Provide --dir and --out (see --help).');
    process.exit(1);
  }
  const outFile = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const round = assembleRound(path.resolve(args.dir), outFile);
  fs.writeFileSync(outFile, renderReport(round));
  console.log(JSON.stringify({ report: outFile, comments: round.entries.length, warnings: round.warnings }, null, 2));

  if (args.build) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hrb = path.resolve(args.hrb || path.join(here, '..', '..', 'html-report-builder'));
    const reportScript = path.join(hrb, 'scripts', 'report.mjs');
    if (!fs.existsSync(reportScript)) {
      console.error(`html-report-builder not found at ${hrb}; pass --hrb or build it yourself.`);
      process.exit(1);
    }
    const buildArgs = [reportScript, 'build', outFile, ...(args.brand ? ['--brand', path.resolve(args.brand)] : [])];
    const result = spawnSync(process.execPath, buildArgs, { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
