'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAccounts, resolveAccount } = require('../lib/accounts');
const { parseTaskUrl } = require('../lib/url-parser');
const { validateTaskPayload, changedPayload, choosePosition } = require('../lib/validation');

describe('accounts', () => {
  it('parses aliases without exposing or changing tokens', () => {
    const accounts = parseAccounts('{"work":"0/secret","personal":"0/other"}');
    assert.deepEqual([...accounts.keys()], ['work', 'personal']);
    assert.deepEqual(resolveAccount(accounts, 'work'), { name: 'work', token: '0/secret' });
  });

  it('requires an alias when multiple accounts exist', () => {
    const accounts = parseAccounts('{"work":"a","personal":"b"}');
    assert.throws(() => resolveAccount(accounts), { code: 'ASANA_ACCOUNT_AMBIGUOUS' });
  });

  it('rejects a misspelled requested alias even when only one exists', () => {
    const accounts = parseAccounts('{"work":"a"}');
    assert.throws(() => resolveAccount(accounts, 'wrk'), { code: 'ASANA_ACCOUNT_NOT_FOUND' });
  });
});

describe('task URL parsing', () => {
  it('supports classic and new task URLs', () => {
    assert.equal(parseTaskUrl('https://app.asana.com/0/123/456/f'), '456');
    assert.equal(parseTaskUrl('https://app.asana.com/1/123/project/456/task/789'), '789');
  });

  it('rejects non-Asana hosts', () => {
    assert.throws(() => parseTaskUrl('https://example.com/0/1/2'), { code: 'ASANA_URL_INVALID' });
  });
});

describe('validation and diffs', () => {
  it('validates compatible date-only task fields', () => {
    const payload = validateTaskPayload({ name: 'Task', start_on: '2026-08-01', due_on: '2026-08-02' }, { create: true });
    assert.equal(payload.due_on, '2026-08-02');
  });

  it('rejects milestones with start dates', () => {
    assert.throws(
      () => validateTaskPayload({ name: 'Milestone', resource_subtype: 'milestone', start_on: '2026-08-01' }, { create: true }),
      { code: 'ASANA_ARGUMENT_INVALID' },
    );
  });

  it('diffs object-backed fields by GID', () => {
    const current = {
      assignee: { gid: '10' },
      custom_fields: [{ gid: '20', enum_value: { gid: '30' } }],
    };
    assert.deepEqual(changedPayload(current, { assignee: '10', custom_fields: { 20: '30' } }), {});
    assert.deepEqual(changedPayload(current, { assignee: '11' }), { assignee: '11' });
  });

  it('permits only one positioning mode', () => {
    assert.deepEqual(choosePosition({ atStart: true }), { insert_after: null });
    assert.throws(() => choosePosition({ before: '1', after: '2' }), { code: 'ASANA_ARGUMENT_INVALID' });
  });
});
