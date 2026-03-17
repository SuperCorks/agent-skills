const { SkillError } = require('./errors');

function createClient(apiKey, options = {}) {
  return {
    apiKey,
    baseUrl: (options.baseUrl || 'https://api.vhx.tv').replace(/\/$/, ''),
  };
}

async function request(client, pathOrHref, options = {}) {
  const url = buildUrl(client.baseUrl, pathOrHref, options.query);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: createAuthHeader(client.apiKey),
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.ok) {
    return body;
  }

  const details = extractMessage(body);
  if (response.status === 401) {
    throw new SkillError('VIMEO_OTT_AUTH_INVALID', details);
  }
  if (response.status === 404) {
    throw new SkillError('VIMEO_OTT_NOT_FOUND', details);
  }
  if (response.status === 429) {
    throw new SkillError('VIMEO_OTT_RATE_LIMITED', details);
  }

  throw new SkillError('VIMEO_OTT_API_ERROR', `HTTP ${response.status}: ${details}`);
}

function buildUrl(baseUrl, pathOrHref, query) {
  const url = pathOrHref.startsWith('http')
    ? new URL(pathOrHref)
    : new URL(pathOrHref.startsWith('/') ? pathOrHref : `/${pathOrHref}`, baseUrl);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

function createAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

function extractMessage(body) {
  if (!body) {
    return 'No details provided';
  }
  if (typeof body === 'string') {
    return body;
  }
  return body.message || body.error || JSON.stringify(body);
}

function toHref(type, idOrHref) {
  if (!idOrHref) {
    return null;
  }
  if (String(idOrHref).startsWith('http')) {
    return String(idOrHref);
  }
  return `https://api.vhx.tv/${type}/${idOrHref}`;
}

function getPathFromIdOrHref(type, idOrHref) {
  const href = toHref(type, idOrHref);
  return new URL(href).pathname;
}

module.exports = {
  createClient,
  request,
  toHref,
  getPathFromIdOrHref,
};