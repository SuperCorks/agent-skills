const test = require('node:test');
const assert = require('node:assert/strict');

const { formatCommand } = require('../lib/command');

test('redacts API keys and context IDs from command errors', () => {
  const formatted = formatCommand('browse', [
    'cloud',
    'sessions',
    'create',
    '--api-key=bb_secret',
    '--context-id',
    'ctx_secret',
  ]);

  assert.equal(
    formatted,
    'browse cloud sessions create --api-key=[redacted] --context-id [redacted]'
  );
  assert.doesNotMatch(formatted, /bb_secret|ctx_secret/);
});
