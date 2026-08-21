'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { mapAsanaError } = require('../lib/errors');

it('maps common Asana HTTP failures to stable error codes', () => {
  const cases = [
    [401, 'ASANA_AUTH_INVALID'],
    [402, 'ASANA_PREMIUM_REQUIRED'],
    [403, 'ASANA_PERMISSION_DENIED'],
    [404, 'ASANA_NOT_FOUND'],
    [429, 'ASANA_RATE_LIMITED'],
  ];
  for (const [status, code] of cases) {
    const error = new Error(`status ${status}`);
    error.status = status;
    if (status === 429) error.response = { headers: { 'retry-after': '12' } };
    const mapped = mapAsanaError(error, { operation: 'test', write: true });
    assert.equal(mapped.code, code);
    assert.equal(mapped.operation, 'test');
    if (status === 429) assert.equal(mapped.retryAfter, '12');
  }
});
