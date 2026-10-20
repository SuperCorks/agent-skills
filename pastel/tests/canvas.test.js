const test = require('node:test');
const assert = require('node:assert/strict');
const { nextVersionName, parseStatus, listVersions, summarizeVersions, parseList } = require('../lib/canvas');

test('continues the canvas own version naming', () => {
  const names = (...list) => list.map((name, index) => ({ id: index + 1, number: index + 1, name }));
  assert.equal(nextVersionName(names(null, '1.0', '2.0', '2.0')), '3.0');
  assert.equal(nextVersionName(names('Round 2')), 'Round 3');
  assert.equal(nextVersionName(names('v4')), 'v5');
  assert.equal(nextVersionName(names('1.2.3')), '2.0.0');
  assert.equal(nextVersionName(names(null, 'Launch')), 'Version 3');
  assert.equal(nextVersionName([]), 'Version 1');
});

test('accepts Pastel statuses as typed in its interface', () => {
  assert.equal(parseStatus('In review'), 'in-review');
  assert.equal(parseStatus('in_progress'), 'in-progress');
  assert.equal(parseStatus('RESOLVED'), 'resolved');
  assert.throws(() => parseStatus('done'), { code: 'PASTEL_STATUS_INVALID' });
});

test('lists live versions in order and counts their comments by status', () => {
  const canvas = {
    CanvasRevisions: [
      { id: 3, number: 3, name: '2.0' },
      { id: 1, number: 1, name: null },
      { id: 2, number: 2, name: '1.0', deletedAt: '2026-10-01' },
    ],
  };
  const versions = listVersions(canvas);
  assert.deepEqual(versions.map((version) => version.id), [1, 3]);
  const summary = summarizeVersions(versions, [
    { CanvasRevisionId: 3, status: 'active' },
    { CanvasRevisionId: 3, status: 'resolved' },
    { CanvasRevisionId: 1, status: 'resolved' },
  ]);
  assert.deepEqual(summary[1].byStatus, { active: 1, 'in-progress': 0, 'in-review': 0, resolved: 1 });
  assert.equal(summary[0].comments, 1);
});

test('parses comma lists, ignoring a bare flag', () => {
  assert.deepEqual(parseList('34, 35,,40'), ['34', '35', '40']);
  assert.deepEqual(parseList(true), []);
});
