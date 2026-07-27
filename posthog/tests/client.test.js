const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createClient,
  request,
  buildUrl,
  resolveApiPath,
  queryProject,
} = require('../lib/client');

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

test('buildUrl preserves path query and appends object parameters', () => {
  const url = buildUrl('https://us.posthog.com', '/api/projects/?existing=1', {
    limit: 25,
    tags: ['a', 'b'],
    filters: { active: true },
  });

  assert.equal(url.origin, 'https://us.posthog.com');
  assert.equal(url.pathname, '/api/projects/');
  assert.equal(url.searchParams.get('existing'), '1');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.deepEqual(url.searchParams.getAll('tags'), ['a', 'b']);
  assert.equal(url.searchParams.get('filters'), '{"active":true}');
});

test('buildUrl rejects absolute URLs and non-API paths', () => {
  assert.throws(
    () => buildUrl('https://us.posthog.com', 'https://example.com/api/projects/'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
  assert.throws(
    () => buildUrl('https://us.posthog.com', '/projects/'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
  assert.throws(
    () => buildUrl('https://us.posthog.com', '/api/../../outside'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
});

test('resolveApiPath scopes relative paths and expands project placeholders', () => {
  assert.equal(
    resolveApiPath('feature_flags/', '123'),
    '/api/projects/123/feature_flags/'
  );
  assert.equal(
    resolveApiPath('/api/projects/:project_id/experiments/', 'a/b'),
    '/api/projects/a%2Fb/experiments/'
  );
  assert.equal(
    resolveApiPath('/api/organizations/abc/', undefined),
    '/api/organizations/abc/'
  );
});

test('resolveApiPath requires a project for relative routes and rejects URLs', () => {
  assert.throws(
    () => resolveApiPath('feature_flags/'),
    (error) => error.code === 'POSTHOG_PROJECT_REQUIRED'
  );
  assert.throws(
    () => resolveApiPath('https://example.com/api/projects/1/', '1'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
  assert.throws(
    () => resolveApiPath('/api/projects/1/../../outside', '1'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
});

test('request sends bearer auth and JSON without exposing credentials in the result', async () => {
  const client = createClient({
    apiKey: 'phx_secret',
    host: 'https://eu.posthog.com',
  });
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ ok: true });
  };

  const result = await request(client, '/api/projects/123/query/', {
    method: 'POST',
    body: { query: { kind: 'HogQLQuery', query: 'select 1' } },
    fetchImpl,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured.url.toString(), 'https://eu.posthog.com/api/projects/123/query/');
  assert.equal(captured.options.headers.Authorization, 'Bearer phx_secret');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), {
    query: { kind: 'HogQLQuery', query: 'select 1' },
  });
});

test('request maps authentication and permission errors', async () => {
  const client = createClient({
    apiKey: 'phx_secret',
    host: 'https://us.posthog.com',
  });

  await assert.rejects(
    request(client, '/api/projects/', {
      fetchImpl: async () => jsonResponse({ detail: 'bad key' }, { status: 401 }),
      retries: 0,
    }),
    (error) => error.code === 'POSTHOG_AUTH_INVALID' && error.message.includes('bad key')
  );

  await assert.rejects(
    request(client, '/api/projects/', {
      fetchImpl: async () => jsonResponse({ detail: 'scope missing' }, { status: 403 }),
      retries: 0,
    }),
    (error) => error.code === 'POSTHOG_PERMISSION_DENIED'
  );
});

test('queryProject posts the expected query endpoint and retries are configurable', async () => {
  const client = createClient({
    apiKey: 'phx_secret',
    host: 'https://us.posthog.com',
  });
  let path;
  let options;
  const fetchImpl = async (url, fetchOptions) => {
    path = url.pathname;
    options = fetchOptions;
    return jsonResponse({ results: [[1]] });
  };

  const result = await queryProject(
    client,
    '123',
    { query: { kind: 'HogQLQuery', query: 'select 1' }, name: 'test query' },
    { fetchImpl, retries: 0 }
  );

  assert.equal(path, '/api/projects/123/query/');
  assert.equal(options.method, 'POST');
  assert.deepEqual(result, { results: [[1]] });
});
