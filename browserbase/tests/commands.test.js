const test = require('node:test');
const assert = require('node:assert/strict');

const { translateLegacyBbArgs, withAccountContext } = require('../lib/commands');

test('translates legacy platform commands to unified browse cloud commands', () => {
  assert.deepEqual(translateLegacyBbArgs(['projects', 'list']), ['cloud', 'projects', 'list']);
  assert.deepEqual(translateLegacyBbArgs(['fetch', 'https://example.com']), ['cloud', 'fetch', 'https://example.com']);
  assert.deepEqual(translateLegacyBbArgs(['functions', 'dev', 'index.ts']), ['functions', 'dev', 'index.ts']);
  assert.deepEqual(translateLegacyBbArgs(['browse', 'https://example.com']), ['open', 'https://example.com']);
  assert.deepEqual(translateLegacyBbArgs(['browse', 'snapshot']), ['snapshot']);
});

test('adds configured context only to cloud session creation', () => {
  const account = { contextId: 'ctx_123' };
  assert.deepEqual(
    withAccountContext(['cloud', 'sessions', 'create'], account),
    ['cloud', 'sessions', 'create', '--context-id', 'ctx_123', '--persist']
  );
  assert.deepEqual(
    withAccountContext(['open', 'https://example.com', '--remote'], account),
    ['open', 'https://example.com', '--remote']
  );
});

test('preserves explicit context selection and supports opting out', () => {
  const account = { contextId: 'ctx_default' };
  assert.deepEqual(
    withAccountContext(['cloud', 'sessions', 'create', '--context-id=ctx_other'], account),
    ['cloud', 'sessions', 'create', '--context-id=ctx_other']
  );
  assert.deepEqual(
    withAccountContext(['cloud', 'sessions', 'create'], account, { noAccountContext: true }),
    ['cloud', 'sessions', 'create']
  );
});

test('supports using the configured context without persisting changes', () => {
  const account = { contextId: 'ctx_default' };
  assert.deepEqual(
    withAccountContext(['cloud', 'sessions', 'create'], account, { readOnlyContext: true }),
    ['cloud', 'sessions', 'create', '--context-id', 'ctx_default']
  );
});

test('rejects conflicting context wrapper modes', () => {
  assert.throws(
    () => withAccountContext(
      ['cloud', 'sessions', 'create'],
      { contextId: 'ctx_default' },
      { readOnlyContext: true, noAccountContext: true }
    ),
    { code: 'BROWSERBASE_ARGS_INVALID' }
  );
});
