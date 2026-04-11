const { SkillError } = require('./errors');

function createClient(apiKey, options = {}) {
  return {
    apiKey,
    baseUrl: (options.baseUrl || 'https://api.vidapp.com').replace(/\/$/, ''),
  };
}

async function request(client, pathOrHref, options = {}) {
  const url = buildUrl(client.baseUrl, pathOrHref, options.query);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-key': client.apiKey,
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.ok) {
    return body;
  }

  const details = extractMessage(body);
  if (response.status === 401 || response.status === 403) {
    throw new SkillError('VIDAPP_AUTH_INVALID', details);
  }
  if (response.status === 404) {
    throw new SkillError('VIDAPP_NOT_FOUND', details);
  }
  if (response.status === 429) {
    throw new SkillError('VIDAPP_RATE_LIMITED', details);
  }

  throw new SkillError('VIDAPP_API_ERROR', `HTTP ${response.status}: ${details}`);
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

function extractMessage(body) {
  if (!body) {
    return 'No details provided';
  }
  if (typeof body === 'string') {
    return body;
  }
  return body.detail || body.message || body.error || JSON.stringify(body);
}

module.exports = {
  createClient,
  request,
  buildUrl,
};