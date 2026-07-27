const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAccounts,
  getConfiguredAccounts,
  resolveAccount,
  resolveProjectId,
  normalizeHost,
} = require('../lib/accounts');

test('parseAccounts normalizes supported credential aliases', () => {
  const accounts = parseAccounts(
    JSON.stringify({
      work: {
        personalApiKey: '  phx_secret  ',
        appHost: 'https://eu.posthog.com/',
        environmentId: 123,
      },
    })
  );

  assert.deepEqual(accounts.get('work'), {
    apiKey: 'phx_secret',
    host: 'https://eu.posthog.com',
    projectId: '123',
  });
});

test('getConfiguredAccounts supports the single-account fallback', () => {
  const accounts = getConfiguredAccounts({
    POSTHOG_PERSONAL_API_KEY: 'phx_single',
    POSTHOG_HOST: 'https://posthog.example.com/',
    POSTHOG_PROJECT_ID: '42',
  });

  assert.deepEqual(accounts.get('default'), {
    apiKey: 'phx_single',
    host: 'https://posthog.example.com',
    projectId: '42',
  });
});

test('resolveAccount auto-selects one account and validates explicit names', () => {
  const accounts = parseAccounts('{"work":{"apiKey":"phx_secret"}}');
  assert.equal(resolveAccount(accounts).name, 'work');
  assert.throws(
    () => resolveAccount(accounts, 'missing'),
    (error) => error.code === 'POSTHOG_ACCOUNT_NOT_FOUND'
  );
});

test('resolveAccount requires a name when multiple accounts exist', () => {
  const accounts = parseAccounts(
    '{"a":{"apiKey":"phx_a"},"b":{"apiKey":"phx_b","host":"https://eu.posthog.com"}}'
  );

  assert.throws(
    () => resolveAccount(accounts),
    (error) => error.code === 'POSTHOG_ACCOUNT_AMBIGUOUS'
  );
  assert.equal(resolveAccount(accounts, 'b').host, 'https://eu.posthog.com');
});

test('resolveProjectId supports overrides and required validation', () => {
  assert.equal(resolveProjectId({ projectId: '1' }, '2'), '2');
  assert.equal(resolveProjectId({ projectId: '1' }), '1');
  assert.equal(resolveProjectId({}, undefined, false), undefined);
  assert.throws(
    () => resolveProjectId({}),
    (error) => error.code === 'POSTHOG_PROJECT_REQUIRED'
  );
});

test('normalizeHost rejects public ingestion hosts', () => {
  assert.throws(
    () => normalizeHost('https://us.i.posthog.com'),
    (error) => error.code === 'POSTHOG_ACCOUNTS_INVALID'
  );
  assert.throws(
    () => normalizeHost('https://posthog.example.com/subpath'),
    (error) => error.code === 'POSTHOG_ACCOUNTS_INVALID'
  );
});
