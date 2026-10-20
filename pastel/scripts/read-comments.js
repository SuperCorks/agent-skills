#!/usr/bin/env node

const { parseArgs, parseDateFlag, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { resolveAuth } = require('../lib/auth');
const { createClient, get } = require('../lib/client');
const { parsePastelUrl } = require('../lib/pastel-url');
const {
  buildMetadata,
  normalizeCanvas,
  normalizeComment,
  extractArray,
  getCommentTimestamp,
} = require('../lib/normalizer');
const { toMarkdown, toCsv } = require('../lib/format');

const HELP = `
Pull comments/annotations from a Pastel canvas.

Usage:
  node scripts/read-comments.js --canvas-url PASTEL_URL [options]
  node scripts/read-comments.js PASTEL_URL [options]
  node scripts/read-comments.js --canvas-id CANVAS_ID [options]
  node scripts/read-comments.js --canvas-name "Canvas name" [options]

Options:
  --account <alias>     Account alias from PASTEL_ACCOUNTS
  --canvas-url <url>      Pastel canvas or comment URL, e.g. https://usepastel.com/link/abc123
  --url <url>             Alias for --canvas-url
  --canvas-id <id>        Pastel canvas id
  --canvas-name <name>    Unique exact or substring canvas name match
  --comment-id <id>       Return one comment by annotation id
  --format <format>       json, markdown, or csv. Default: json
  --status <list>         Comma-separated statuses to keep
  --since <date>          Keep comments created/updated on or after this date
  --until <date>          Keep comments created/updated on or before this date
  --search <text>         Keep comments/replies containing text
  --include-canvas        Include canvas object in JSON output
  --raw                   Return raw annotations in JSON
  --base-url <url>        Override API base URL
  --help                  Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const format = String(args.format || 'json').toLowerCase();
  if (!['json', 'markdown', 'csv'].includes(format)) {
    throw new SkillError('PASTEL_FORMAT_INVALID', `Unsupported format: ${format}`);
  }
  if (args.raw && format !== 'json') {
    throw new SkillError('PASTEL_ARGS_INVALID', '--raw is only supported with JSON output');
  }

  const since = parseDate(args.since, '--since');
  const until = parseDate(args.until, '--until');
  const statuses = args.status ? new Set(String(args.status).split(',').map((value) => value.trim()).filter(Boolean)) : null;
  const search = args.search ? String(args.search).toLowerCase() : null;
  const explicitCommentId = parseCommentId(args.commentId, '--comment-id');

  const auth = resolveAuth({ account: args.account, zshrcPath: args.zshrc });
  const client = createClient(auth.apiToken, { baseUrl: args.baseUrl || auth.baseUrl });
  const resolved = await resolveCanvas(client, args, explicitCommentId);
  const rawAnnotations = await fetchAnnotations(client, resolved.id);
  const pairs = rawAnnotations.map((raw) => ({ raw, comment: normalizeComment(raw) }));
  const targetCommentId = resolved.commentId || explicitCommentId;
  const targetPairs = targetCommentId
    ? pairs.filter(({ raw, comment }) => String(comment.id || raw.id) === targetCommentId)
    : pairs;

  if (targetCommentId && targetPairs.length === 0) {
    throw new SkillError('PASTEL_COMMENT_NOT_FOUND', `Comment ${targetCommentId} was not found on canvas ${resolved.id}`);
  }

  const filteredPairs = targetPairs.filter(({ comment, raw }) => keepComment(comment, raw, { statuses, since, until, search }));
  const comments = filteredPairs.map(({ comment }) => comment);

  const metadata = buildMetadata('read-comments', {
    canvasId: resolved.id,
    account: auth.name,
    canvasName: resolved.canvas?.name || resolved.canvas?.title || args.canvasName || null,
    canvasSlug: resolved.urlInfo?.canvasSlug || resolved.canvas?.subdomain || null,
    inputUrl: resolved.urlInfo?.originalUrl || null,
    commentId: targetCommentId || null,
    totalReturned: rawAnnotations.length,
    totalAfterFilters: comments.length,
    filters: {
      commentId: targetCommentId || null,
      status: args.status || null,
      since: args.since || null,
      until: args.until || null,
      search: args.search || null,
    },
  });

  if (format === 'markdown') {
    console.log(toMarkdown({ metadata, canvas: resolved.canvas ? normalizeCanvas(resolved.canvas) : null, comments }));
    return;
  }
  if (format === 'csv') {
    console.log(toCsv(comments));
    return;
  }

  const result = {
    metadata,
    comments: args.raw ? filteredPairs.map(({ raw }) => raw) : comments,
  };
  if (args.includeCanvas && resolved.canvas) {
    result.canvas = args.raw ? resolved.canvas : normalizeCanvas(resolved.canvas);
  }
  outputJson(result);
}

async function resolveCanvas(client, args, explicitCommentId) {
  const canvasUrl = getCanvasUrlArg(args);
  validateCanvasSelectorCount(args, canvasUrl);

  if (canvasUrl) {
    const urlInfo = parsePastelUrl(canvasUrl);
    const commentId = mergeCommentIds(urlInfo.commentId, explicitCommentId);

    if (urlInfo.canvasSlug) {
      const canvas = await fetchCanvasBySubdomain(client, urlInfo.canvasSlug);
      return { id: canvas.id, canvas, urlInfo, commentId };
    }

    if (urlInfo.canvasId) {
      const canvas = args.includeCanvas ? await fetchCanvas(client, urlInfo.canvasId) : null;
      return { id: urlInfo.canvasId, canvas, urlInfo, commentId };
    }
  }

  if (args.canvasId) {
    const canvas = args.includeCanvas ? await fetchCanvas(client, args.canvasId) : null;
    return { id: args.canvasId, canvas, commentId: explicitCommentId };
  }

  if (!args.canvasName) {
    throw new SkillError('PASTEL_CANVAS_REQUIRED');
  }

  const body = await get(client, '/users/me/canvases', { query: { limit: 500, offset: 0 } });
  const canvases = extractArray(body, ['canvases']);
  const name = String(args.canvasName).toLowerCase();
  const exact = canvases.filter((canvas) => String(canvas.name || '').toLowerCase() === name);
  const matches = exact.length ? exact : canvases.filter((canvas) => String(canvas.name || '').toLowerCase().includes(name));

  if (matches.length === 0) {
    throw new SkillError('PASTEL_CANVAS_NOT_FOUND', `No canvas matched "${args.canvasName}"`);
  }
  if (matches.length > 1) {
    throw new SkillError('PASTEL_CANVAS_AMBIGUOUS', `"${args.canvasName}" matched ${matches.length} canvases`, matches.map(normalizeCanvas));
  }
  return { id: matches[0].id, canvas: matches[0], commentId: explicitCommentId };
}

function getCanvasUrlArg(args) {
  if (args.canvasUrl) {
    return args.canvasUrl;
  }
  if (args.url) {
    return args.url;
  }
  return (args._ || []).find((value) => /usepastel\.com/i.test(String(value))) || null;
}

function validateCanvasSelectorCount(args, canvasUrl) {
  const selectors = [canvasUrl, args.canvasId, args.canvasName].filter(Boolean);
  if (selectors.length > 1) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Pass only one of --canvas-url, --canvas-id, or --canvas-name');
  }
}

function mergeCommentIds(urlCommentId, explicitCommentId) {
  if (urlCommentId && explicitCommentId && String(urlCommentId) !== String(explicitCommentId)) {
    throw new SkillError('PASTEL_ARGS_INVALID', `URL comment id ${urlCommentId} does not match --comment-id ${explicitCommentId}`);
  }
  return urlCommentId ? String(urlCommentId) : explicitCommentId;
}

async function fetchCanvasBySubdomain(client, subdomain) {
  const canvas = await get(client, `/canvases/${encodeURIComponent(subdomain)}/subdomain`);
  if (!canvas || !canvas.id) {
    throw new SkillError('PASTEL_CANVAS_NOT_FOUND', `No canvas matched Pastel URL slug "${subdomain}"`, canvas);
  }
  return canvas;
}

async function fetchCanvas(client, canvasId) {
  try {
    return await get(client, `/canvases/${encodeURIComponent(canvasId)}`);
  } catch (error) {
    if (error.code === 'PASTEL_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

async function fetchAnnotations(client, canvasId) {
  const body = await get(client, `/canvases/${encodeURIComponent(canvasId)}/annotations`);
  return extractArray(body, ['annotations']);
}

function keepComment(comment, raw, filters) {
  if (filters.statuses && !filters.statuses.has(String(comment.status || raw.status || ''))) {
    return false;
  }

  const timestamp = getCommentTimestamp(comment);
  if (filters.since && timestamp && timestamp < filters.since) {
    return false;
  }
  if (filters.until && timestamp && timestamp > filters.until) {
    return false;
  }

  if (filters.search) {
    const haystack = [
      comment.comment,
      ...comment.replies.map((reply) => reply.comment),
      comment.userName,
      comment.userEmail,
      comment.path,
      comment.pageUrl,
    ].filter(Boolean).join('\n').toLowerCase();
    if (!haystack.includes(filters.search)) {
      return false;
    }
  }

  return true;
}

function parseDate(value, flagName) {
  const parsed = parseDateFlag(value, flagName);
  if (!parsed) {
    return null;
  }
  if (!parsed.valid) {
    throw new SkillError('PASTEL_DATE_INVALID', parsed.message);
  }
  return parsed.value;
}

function parseCommentId(value, flagName) {
  if (!value) {
    return null;
  }
  const id = String(value).trim();
  if (!id || !/^\d+$/.test(id)) {
    throw new SkillError('PASTEL_ARGS_INVALID', `${flagName} must be a numeric annotation id`);
  }
  return id;
}

main().catch(outputError);
