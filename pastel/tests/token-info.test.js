const test = require('node:test');
const assert = require('node:assert/strict');
const { findTokenRecord, describeToken } = require('../lib/token-info');

const now = new Date('2026-11-20T13:30:00.000Z');
const record = (overrides = {}) => ({
  id: 1,
  name: 'Agents',
  tokenPrefix: 'pstl_pat_c17295fd...',
  audience: 'api',
  expiresAt: '2027-11-20T13:20:51.347Z',
  lastUsedAt: '2026-11-20T13:21:47.530Z',
  deletedAt: null,
  ...overrides,
});

test('matches the token to its listing by prefix and skips revoked tokens', () => {
  const token = 'pstl_pat_c17295fd0000';
  assert.equal(findTokenRecord(token, [record({ tokenPrefix: 'pstl_pat_aaaa...' }), record()]).name, 'Agents');
  assert.equal(findTokenRecord(token, [record({ deletedAt: '2026-11-21' })]), null);
  assert.equal(findTokenRecord('7be8ca0000', [record()]), null);
});

test('reports days left and warns inside the window', () => {
  const ok = describeToken('pstl_pat_c17295fd0000', [record()], { now });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.daysLeft, 364);
  assert.deepEqual(ok.warnings, []);

  const soon = describeToken('pstl_pat_c17295fd0000', [record({ expiresAt: '2026-12-10T00:00:00.000Z' })], { now });
  assert.equal(soon.status, 'expiring');
  assert.match(soon.warnings[0], /expires on 2026-12-10/);

  const gone = describeToken('pstl_pat_c17295fd0000', [record({ expiresAt: '2026-11-01T00:00:00.000Z' })], { now });
  assert.equal(gone.status, 'expired');
});

test('flags legacy tokens and unlisted access tokens', () => {
  const legacy = describeToken('7be8ca0000000000000b101', [], { now });
  assert.equal(legacy.status, 'legacy');
  assert.equal(legacy.daysLeft, 86);

  assert.equal(describeToken('pstl_pat_ffff0000', [record()], { now }).status, 'unknown');
  assert.equal(describeToken('pstl_pat_c17295fd0000', null, { now }).status, 'unknown');
});
