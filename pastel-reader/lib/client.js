const { SkillError } = require('./errors');

const DEFAULT_BASE_URL = 'https://api.usepastel.com/v1';

function createClient(apiToken, options = {}) {
  const baseUrl = (options.baseUrl || process.env.PASTEL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    apiToken,
    baseUrl,
  };
}

async function get(client, pathOrHref, options = {}) {
  const url = buildUrl(client.baseUrl, pathOrHref, options.query);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${client.apiToken}`,
      ...options.headers,
    },
  });

  const body = await readBody(response);
  if (response.ok) {
    return body;
  }

  throw mapApiError(response, body);
}

function buildUrl(baseUrl, pathOrHref, query) {
  const normalizedPath = pathOrHref.startsWith('/') ? pathOrHref.slice(1) : pathOrHref;
  const url = pathOrHref.startsWith('http')
    ? new URL(pathOrHref)
    : new URL(normalizedPath, `${baseUrl}/`);

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

async function readBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function mapApiError(response, body) {
  const message = extractMessage(body);
  const apiError = typeof body === 'object' && body ? body.error : null;
  const tokenError = apiError === 'InvalidParameter' && body.meta?.parameter === 'token';

  if (response.status === 401 || response.status === 403 || apiError === 'NotLoggedIn' || tokenError) {
    return new SkillError('PASTEL_AUTH_INVALID', message, body);
  }
  if (response.status === 404) {
    return new SkillError('PASTEL_NOT_FOUND', message, body);
  }
  if (response.status === 429) {
    return new SkillError('PASTEL_RATE_LIMITED', message, body);
  }
  return new SkillError('PASTEL_API_ERROR', `HTTP ${response.status}: ${message}`, body);
}

function extractMessage(body) {
  if (!body) {
    return 'No details provided';
  }
  if (typeof body === 'string') {
    return body;
  }
  return body.message || body.error || body.detail || JSON.stringify(body);
}

module.exports = {
  DEFAULT_BASE_URL,
  createClient,
  get,
  buildUrl,
};
