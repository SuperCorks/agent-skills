const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseArgs,
  parseInteger,
  parseMethod,
  readJsonInput,
  assertObject,
} = require('../lib/cli');

test('parseArgs supports values, booleans, equals syntax, and kebab case', () => {
  assert.deepEqual(
    parseArgs(['--account', 'work', '--query-json={"limit":1}', '--confirm']),
    {
      account: 'work',
      queryJson: '{"limit":1}',
      confirm: true,
    }
  );
});

test('parseArgs rejects positional arguments', () => {
  assert.throws(
    () => parseArgs(['unexpected']),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
});

test('parseInteger and parseMethod validate values', () => {
  assert.equal(parseInteger('20', '--limit', { min: 1, max: 100 }), 20);
  assert.equal(parseMethod('patch'), 'PATCH');
  assert.throws(
    () => parseInteger('1.5', '--limit'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
  assert.throws(
    () => parseMethod('TRACE'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
});

test('readJsonInput reads inline JSON and files', () => {
  assert.deepEqual(
    readJsonInput({ json: '{"kind":"HogQLQuery"}', label: 'query' }),
    { kind: 'HogQLQuery' }
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'posthog-skill-'));
  const file = path.join(directory, 'body.json');
  fs.writeFileSync(file, '{"active":true}');
  try {
    assert.deepEqual(readJsonInput({ file, label: 'body' }), { active: true });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('readJsonInput and assertObject reject ambiguous or invalid input', () => {
  assert.throws(
    () => readJsonInput({ json: '{}', file: '/tmp/body.json', label: 'body' }),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
  assert.throws(
    () => assertObject([], 'Query'),
    (error) => error.code === 'POSTHOG_ARGS_INVALID'
  );
});
