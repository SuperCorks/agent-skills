#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { buildMetadata } = require('../lib/normalizer');
const { parseList } = require('../lib/canvas');

const HELP = `
Download each comment's Pastel screenshot and attachments (and reply attachments)
so they can be viewed and reused in the feedback report. Read-only.

Usage:
  node scripts/download-media.js --comments comments.json --out DIR [--numbers 34,35]

Options:
  --comments <file>    Output of read-comments.js (JSON)
  --out <dir>          Directory for the files; media.json is written beside them
  --numbers <list>     Only these comment numbers
  --help               Show this help message

Files are named <number>-pastel.<ext>, <number>-pastel-after.<ext>,
<number>-attachment-<n>.<ext>, and <number>-reply-<r>-<n>.<ext>.
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }
  if (!args.comments || !args.out) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Provide --comments and --out');
  }

  const comments = readComments(args.comments);
  const numbers = parseList(args.numbers).map(Number);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const media = {};
  const failures = [];
  for (const comment of comments) {
    if (numbers.length && !numbers.includes(comment.number)) {
      continue;
    }
    const items = [];
    if (comment.screenshotUrl) {
      items.push({ kind: 'pastel-screenshot', label: 'Pastel screenshot', url: comment.screenshotUrl, base: `${comment.number}-pastel` });
    }
    if (comment.afterScreenshotUrl) {
      items.push({ kind: 'pastel-after-screenshot', label: 'Pastel after screenshot', url: comment.afterScreenshotUrl, base: `${comment.number}-pastel-after` });
    }
    (comment.fileAttachments || []).forEach((file, index) => {
      items.push({ kind: 'attachment', label: file.name || `Attachment ${index + 1}`, url: file.url, base: `${comment.number}-attachment-${index + 1}` });
    });
    (comment.replies || []).forEach((reply, replyIndex) => {
      (reply.fileAttachments || []).forEach((file, index) => {
        items.push({ kind: 'reply-attachment', label: file.name || `Reply ${replyIndex + 1} attachment ${index + 1}`, url: file.url, base: `${comment.number}-reply-${replyIndex + 1}-${index + 1}` });
      });
    });

    media[comment.number] = [];
    for (const item of items) {
      if (!item.url) {
        failures.push({ number: comment.number, label: item.label, error: 'No URL' });
        continue;
      }
      try {
        const file = await download(item.url, outDir, item.base);
        media[comment.number].push({ kind: item.kind, label: item.label, file, url: item.url });
      } catch (error) {
        failures.push({ number: comment.number, label: item.label, error: error.message });
      }
    }
  }

  const manifest = {
    metadata: buildMetadata('download-media', { source: path.resolve(args.comments) }),
    media,
    failures,
  };
  fs.writeFileSync(path.join(outDir, 'media.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  outputJson({ ...manifest, manifest: path.join(outDir, 'media.json') });
}

function readComments(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SkillError('PASTEL_INPUT_INVALID', `Could not read ${file}: ${error.message}`);
  }
  const comments = Array.isArray(parsed) ? parsed : parsed.comments;
  if (!Array.isArray(comments)) {
    throw new SkillError('PASTEL_INPUT_INVALID', `${file} has no comments array; pass read-comments.js JSON output`);
  }
  return comments;
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

async function download(url, outDir, base) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const type = (response.headers.get('content-type') || '').split(';')[0].trim();
  const fromUrl = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
  const ext = EXTENSIONS[type] || fromUrl || 'bin';
  const file = path.join(outDir, `${base}.${ext}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return path.basename(file);
}

main().catch(outputError);
