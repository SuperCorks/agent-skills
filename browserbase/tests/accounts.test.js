const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAccountEnv,
  parseAccounts,
  resolveAccount,
  summarizeAccount,
} = require('../lib/accounts');

test('parses and resolves one account automatically', () => {
  const accounts = parseAccounts(JSON.stringify({
    prod: {
      apiKey: 'bb_live_secret',
      projectId: 'proj_123',
      contextId: 'ctx_123',
    },
  }), {});

  assert.deepEqual(resolveAccount(accounts), {
    name: 'prod',
    apiKey: 'bb_live_secret',
    projectId: 'proj_123',
    contextId: 'ctx_123',
    baseUrl: undefined,
    session: undefined,
  });
});

test('requires an explicit alias when multiple accounts exist', () => {
  const accounts = parseAccounts('{"prod":"key-a","sandbox":"key-b"}', {});
  assert.throws(() => resolveAccount(accounts), { code: 'BROWSERBASE_ACCOUNT_AMBIGUOUS' });
  assert.equal(resolveAccount(accounts, 'sandbox').apiKey, 'key-b');
});

test('builds isolated account environment and disables dotenv loading', () => {
  const env = buildAccountEnv({ name: 'client-a', apiKey: 'secret' }, {
    BROWSERBASE_PROJECT_ID: 'stale-project',
    BROWSERBASE_CONTEXT_ID: 'stale-context',
    BROWSERBASE_BASE_URL: 'https://stale.invalid',
    BROWSERBASE_API_BASE_URL: 'https://legacy-stale.invalid',
    BROWSE_SESSION: 'unsafe-shared-session',
  });

  assert.equal(env.BROWSERBASE_API_KEY, 'secret');
  assert.equal(env.BROWSE_SESSION, 'browserbase-client-a');
  assert.equal(env.BROWSE_LOAD_DOTENV, '0');
  assert.equal(env.BROWSERBASE_PROJECT_ID, undefined);
  assert.equal(env.BROWSERBASE_CONTEXT_ID, undefined);
  assert.equal(env.BROWSERBASE_BASE_URL, undefined);
  assert.equal(env.BROWSERBASE_API_BASE_URL, undefined);
});

test('never includes API keys or context IDs in account summaries', () => {
  const summary = summarizeAccount('prod', {
    apiKey: 'bb_live_super_secret',
    contextId: 'ctx_super_secret',
  });

  assert.equal(summary.apiKey, '[configured]');
  assert.equal(summary.contextId, '[configured]');
  assert.doesNotMatch(JSON.stringify(summary), /super_secret/);
});

test('rejects aliases that are unsafe as daemon session names', () => {
  assert.throws(
    () => parseAccounts('{"bad alias":"key"}', {}),
    { code: 'BROWSERBASE_AUTH_INVALID' }
  );
});
