const { SkillError } = require('./errors');
const { normalizeHost } = require('./accounts');

function createClient(account, options = {}) {
  return {
    apiKey: account.apiKey,
    host: normalizeHost(options.host || account.host),
  };
}

async function request(client, apiPath, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const url = buildUrl(client.host, apiPath, options.query);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const retries = options.retries ?? (['GET', 'HEAD'].includes(method) ? 2 : 0);
  const retryDelayMs = options.retryDelayMs ?? 500;

  if (typeof fetchImpl !== 'function') {
    throw new SkillError('POSTHOG_API_ERROR', 'A fetch implementation is required');
  }

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${client.apiKey}`,
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw new SkillError('POSTHOG_API_ERROR', error.message);
    }

    const body = await parseResponseBody(response);
    if (response.ok) {
      return body;
    }

    const details = extractMessage(body);
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      await sleep(retryAfterMs ?? retryDelayMs * (attempt + 1));
      continue;
    }

    if (response.status === 401) {
      throw new SkillError('POSTHOG_AUTH_INVALID', details);
    }
    if (response.status === 403) {
      throw new SkillError('POSTHOG_PERMISSION_DENIED', details);
    }
    if (response.status === 404) {
      throw new SkillError('POSTHOG_NOT_FOUND', details);
    }
    if (response.status === 429) {
      throw new SkillError('POSTHOG_RATE_LIMITED', details);
    }

    throw new SkillError('POSTHOG_API_ERROR', `HTTP ${response.status}: ${details}`);
  }

  throw new SkillError('POSTHOG_API_ERROR', 'Unknown request failure');
}

function buildUrl(host, apiPath, query) {
  if (typeof apiPath !== 'string' || !apiPath.startsWith('/api/')) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      'API path must be relative and start with /api/'
    );
  }
  if (/^\/\//.test(apiPath) || /^[a-z][a-z\d+.-]*:/i.test(apiPath)) {
    throw new SkillError('POSTHOG_ARGS_INVALID', 'Full URLs are not allowed');
  }

  const base = new URL(normalizeHost(host));
  const url = new URL(apiPath, `${base.origin}/`);
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/')) {
    throw new SkillError('POSTHOG_ARGS_INVALID', 'API path must stay on the configured host');
  }

  if (query !== undefined) {
    if (typeof query !== 'object' || query === null || Array.isArray(query)) {
      throw new SkillError('POSTHOG_ARGS_INVALID', 'Query parameters must be a JSON object');
    }

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, serializeQueryValue(item));
        }
      } else {
        url.searchParams.set(key, serializeQueryValue(value));
      }
    }
  }

  return url;
}

function resolveApiPath(input, projectId) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new SkillError('POSTHOG_ARGS_INVALID', '--path is required');
  }

  const path = input.trim();
  if (/^(?:https?:)?\/\//i.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new SkillError('POSTHOG_ARGS_INVALID', 'Full URLs are not allowed');
  }
  if (path.split(/[/?#]/).includes('..')) {
    throw new SkillError('POSTHOG_ARGS_INVALID', 'API path cannot contain parent traversal');
  }

  const placeholders = [':project_id', '{project_id}', '{projectId}'];
  if (path.startsWith('/api/')) {
    if (placeholders.some((placeholder) => path.includes(placeholder))) {
      if (!projectId) {
        throw new SkillError('POSTHOG_PROJECT_REQUIRED');
      }
      return placeholders.reduce(
        (resolved, placeholder) => resolved.replaceAll(placeholder, encodeURIComponent(projectId)),
        path
      );
    }
    return path;
  }

  if (!projectId) {
    throw new SkillError('POSTHOG_PROJECT_REQUIRED');
  }

  const resourcePath = path.replace(/^\/+/, '');
  if (!resourcePath || resourcePath.split('/').includes('..')) {
    throw new SkillError('POSTHOG_ARGS_INVALID', 'Invalid project-relative path');
  }

  return `/api/projects/${encodeURIComponent(projectId)}/${resourcePath}`;
}

function listProjects(client, options = {}) {
  return request(client, '/api/projects/', {
    query: {
      limit: options.limit,
      offset: options.offset,
    },
    fetchImpl: options.fetchImpl,
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
  });
}

function getProject(client, projectId, options = {}) {
  return request(client, `/api/projects/${encodeURIComponent(projectId)}/`, options);
}

function queryProject(client, projectId, body, options = {}) {
  return request(client, `/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: 'POST',
    body,
    fetchImpl: options.fetchImpl,
    retries: options.retries ?? 2,
    retryDelayMs: options.retryDelayMs,
  });
}

async function parseResponseBody(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (contentType.includes('application/json') && text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text || null;
}

function extractMessage(body) {
  if (body === null || body === undefined || body === '') {
    return 'No details provided';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Array.isArray(body)) {
    return JSON.stringify(body);
  }

  const value = body.detail || body.message || body.error || body.code;
  return typeof value === 'string' ? value : JSON.stringify(body);
}

function serializeQueryValue(value) {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function parseRetryAfter(value) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), 10_000);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return Math.min(Math.max(timestamp - Date.now(), 0), 10_000);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  createClient,
  request,
  buildUrl,
  resolveApiPath,
  listProjects,
  getProject,
  queryProject,
  extractMessage,
};
