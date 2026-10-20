const { SkillError } = require('./errors');
const { get } = require('./client');
const { parsePastelUrl } = require('./pastel-url');
const { extractArray } = require('./normalizer');

/** Pastel's comment states, in its own order, with the labels its UI shows. */
const STATUSES = ['active', 'in-progress', 'in-review', 'resolved'];
const STATUS_LABELS = {
  active: 'Active',
  'in-progress': 'In progress',
  'in-review': 'In review',
  resolved: 'Resolved',
};
/** Pastel's default filter: every comment that is not resolved. */
const OPEN_STATUSES = ['active', 'in-progress', 'in-review'];

function parseStatus(value) {
  const status = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!STATUSES.includes(status)) {
    throw new SkillError('PASTEL_STATUS_INVALID', `Unknown status "${value}"`);
  }
  return status;
}

/**
 * Resolve a canvas from its share URL. Only the slug lookup returns the full
 * canvas (with CanvasRevisions); GET /canvases/{id} is not a public method.
 */
async function fetchCanvasByUrl(client, canvasUrl) {
  if (!canvasUrl) {
    throw new SkillError('PASTEL_CANVAS_REQUIRED', 'Pass --canvas-url with the canvas share link, e.g. https://usepastel.com/link/abc123');
  }
  const urlInfo = parsePastelUrl(canvasUrl);
  if (!urlInfo.canvasSlug) {
    throw new SkillError('PASTEL_URL_INVALID', 'Use the canvas share link (https://usepastel.com/link/<slug>); it is the only way to read versions');
  }
  const canvas = await get(client, `/canvases/${encodeURIComponent(urlInfo.canvasSlug)}/subdomain`);
  if (!canvas || !canvas.id) {
    throw new SkillError('PASTEL_CANVAS_NOT_FOUND', `No canvas matched Pastel URL slug "${urlInfo.canvasSlug}"`);
  }
  return { canvas, urlInfo };
}

async function fetchAnnotations(client, canvasId) {
  const body = await get(client, `/canvases/${encodeURIComponent(canvasId)}/annotations`);
  return extractArray(body, ['annotations']);
}

/** Versions oldest first, skipping deleted ones. */
function listVersions(canvas) {
  return (Array.isArray(canvas.CanvasRevisions) ? canvas.CanvasRevisions : [])
    .filter((revision) => !revision.deletedAt)
    .sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
}

/**
 * Next name in the canvas's own scheme: "2.0" -> "3.0", "Round 2" -> "Round 3",
 * "v4" -> "v5". Falls back to "Version N" when no earlier name has a number.
 */
function nextVersionName(versions) {
  for (const version of [...versions].reverse()) {
    const name = String(version.name || '');
    const match = name.match(/^(.*?)(\d+)((?:\.\d+)*)(\D*)$/);
    if (match) {
      const [, prefix, major, minor, suffix] = match;
      const zeroedMinor = minor.replace(/\d+/g, '0');
      return `${prefix}${Number(major) + 1}${zeroedMinor}${suffix}`;
    }
  }
  return `Version ${versions.length + 1}`;
}

function summarizeVersions(versions, annotations) {
  return versions.map((version) => {
    const comments = annotations.filter((annotation) => annotation.CanvasRevisionId === version.id);
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const comment of comments) {
      byStatus[comment.status] = (byStatus[comment.status] || 0) + 1;
    }
    return {
      id: version.id,
      number: version.number ?? null,
      name: version.name ?? null,
      createdAt: version.createdAt ?? null,
      comments: comments.length,
      byStatus,
    };
  });
}

function parseList(value) {
  if (value === undefined || value === null || value === true) {
    return [];
  }
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  OPEN_STATUSES,
  parseStatus,
  fetchCanvasByUrl,
  fetchAnnotations,
  listVersions,
  nextVersionName,
  summarizeVersions,
  parseList,
};
