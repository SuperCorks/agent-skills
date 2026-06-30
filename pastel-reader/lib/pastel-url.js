const { SkillError } = require('./errors');

function parsePastelUrl(input) {
  const originalUrl = String(input || '').trim();
  if (!originalUrl) {
    throw new SkillError('PASTEL_URL_INVALID', 'Pastel URL is empty');
  }

  let url;
  try {
    const href = /^[a-z][a-z\d+.-]*:\/\//i.test(originalUrl) ? originalUrl : `https://${originalUrl}`;
    url = new URL(href);
  } catch (error) {
    throw new SkillError('PASTEL_URL_INVALID', `Invalid Pastel URL: ${originalUrl}`);
  }

  const host = normalizeHost(url.hostname);
  if (!isPastelHost(host)) {
    throw new SkillError('PASTEL_URL_INVALID', `URL host is not usepastel.com: ${url.hostname}`);
  }

  const segments = url.pathname.split('/').filter(Boolean).map(safeDecode);
  const linkMatch = findSegmentValue(segments, ['link']);
  const canvasMatch = findSegmentValue(segments, ['canvas', 'canvases']);
  const commentId = findSegmentValue(segments, ['comment', 'comments', 'annotation', 'annotations']) || null;
  const subdomain = extractSubdomain(host);

  if (linkMatch) {
    return {
      originalUrl,
      href: url.href,
      canvasSlug: linkMatch,
      canvasId: null,
      commentId,
      pathSegments: segments,
    };
  }

  if (canvasMatch) {
    return {
      originalUrl,
      href: url.href,
      canvasSlug: null,
      canvasId: canvasMatch,
      commentId,
      pathSegments: segments,
    };
  }

  if (subdomain) {
    return {
      originalUrl,
      href: url.href,
      canvasSlug: subdomain,
      canvasId: null,
      commentId,
      pathSegments: segments,
    };
  }

  throw new SkillError('PASTEL_URL_INVALID', `Could not find a canvas slug or id in Pastel URL: ${originalUrl}`);
}

function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

function isPastelHost(host) {
  return host === 'usepastel.com' || host.endsWith('.usepastel.com');
}

function extractSubdomain(host) {
  const suffix = '.usepastel.com';
  if (!host.endsWith(suffix) || host === `api${suffix}` || host === `app${suffix}`) {
    return null;
  }

  const prefix = host.slice(0, -suffix.length);
  return prefix && !prefix.includes('.') ? prefix : null;
}

function findSegmentValue(segments, names) {
  const normalizedNames = new Set(names);
  for (let index = 0; index < segments.length - 1; index++) {
    if (normalizedNames.has(String(segments[index]).toLowerCase())) {
      return segments[index + 1] || null;
    }
  }
  return null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new SkillError('PASTEL_URL_INVALID', `URL path contains invalid encoding: ${value}`);
  }
}

module.exports = {
  parsePastelUrl,
};
