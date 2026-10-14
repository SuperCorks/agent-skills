import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, FirefliesError, retryDelay } from '../scripts/client.mjs';
import { resolveCredential, validateAlias, validateKey } from '../scripts/auth.mjs';
import { parseCommand } from '../scripts/fireflies.mjs';
import { meetingId, isoDate, listMeetings, readMeeting, timestamp, selectSentences, renderMeeting } from '../scripts/meetings.mjs';

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test('client sends bearer auth and structured variables to the fixed endpoint', async () => {
  const client = createClient('fixture-key', { fetchImpl: async (url, request) => {
    assert.equal(url, 'https://api.fireflies.ai/graphql');
    assert.equal(request.headers.Authorization, 'Bearer fixture-key');
    assert.equal(request.redirect, 'error');
    assert.deepEqual(JSON.parse(request.body).variables, { keyword: 'pricing "options"' });
    return response({ data: { transcripts: [] } });
  } });
  assert.deepEqual(await client('query Meetings { transcripts { id } }', { keyword: 'pricing "options"' }), { transcripts: [] });
});

test('HTTP 200 GraphQL errors reject partial data and redact the key', async () => {
  const client = createClient('fixture-key', { fetchImpl: async () => response({
    data: { transcripts: [{ id: 'partial' }] },
    errors: [{ message: 'Invalid fixture-key', extensions: { code: 'invalid_auth' } }],
  }) });
  await assert.rejects(client('query Example { user { email } }'), error => {
    assert.equal(error.message, 'Invalid [redacted]');
    assert.deepEqual(error.codes, ['invalid_auth']);
    return error instanceof FirefliesError;
  });
});

test('client distinguishes HTTP failure, malformed responses, and network errors', async () => {
  const http = createClient('fixture-key', { fetchImpl: async () => response({}, 401) });
  await assert.rejects(http('query Q { user { email } }'), /HTTP 401/);
  const malformed = createClient('fixture-key', { fetchImpl: async () => new Response('<html>error</html>') });
  await assert.rejects(malformed('query Q { user { email } }'), /no GraphQL data/);
  const network = createClient('fixture-key', { fetchImpl: async () => { throw new Error('fixture-key network'); } });
  await assert.rejects(network('query Q { user { email } }'), error => !error.message.includes('fixture-key'));
});

test('rate-limit headers and metadata use their documented units', () => {
  const now = Date.UTC(2026, 9, 14);
  assert.equal(retryDelay(response({}, 429, { 'retry-after': '7' }), [], now), 7);
  assert.equal(retryDelay(response({}, 429), [{ extensions: { metadata: { retryAfter: now + 12_000 } } }], now), 12);
  assert.equal(retryDelay(response({}, 429, { 'retry-after': new Date(now + 20_000).toUTCString() }), [], now), 20);
  assert.equal(retryDelay(response({}, 429, { 'x-ratelimit-reset': '60' }), [], now), 60);
});

test('bounded retries wait once and succeed, but stop on a long block', async () => {
  let attempts = 0;
  const waits = [];
  const client = createClient('fixture-key', {
    fetchImpl: async () => ++attempts === 1 ? response({}, 429, { 'retry-after': '2' }) : response({ data: { user: {} } }),
    sleep: async ms => { waits.push(ms); },
  });
  await client('query Q { user { email } }');
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [2000]);
  const blocked = createClient('fixture-key', {
    fetchImpl: async () => response({}, 429, { 'retry-after': '3600' }),
    sleep: async () => assert.fail('Must not wait for an hour'),
  });
  await assert.rejects(blocked('query Q { user { email } }'), error => error.retryAfterSeconds === 3600);
});

test('rate limits with HTTP 200 retry; repeated short blocks exhaust the budget', async () => {
  let attempts = 0;
  const client = createClient('fixture-key', {
    now: () => 100_000,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts++;
      return response({ errors: [{ code: 'too_many_requests', extensions: { metadata: { retryAfter: 105_000 } } }] });
    },
  });
  await assert.rejects(client('query Q { user { email } }'), /rate limit/);
  assert.equal(attempts, 3);
});

test('mutation documents are rejected without a request', async () => {
  const client = createClient('fixture-key', { fetchImpl: async () => assert.fail('No request expected') });
  await assert.rejects(client('mutation Delete { deleteTranscript(id: "x") { success } }'), /read-only/);
});

test('meeting URL parsing accepts actual URL shapes and rejects foreign hosts', () => {
  assert.equal(meetingId('01ABC'), '01ABC');
  assert.equal(meetingId('https://app.fireflies.ai/view/01ABC?from=search'), '01ABC');
  assert.equal(meetingId('https://app.fireflies.ai/view/Pricing-Discussion%3A%3A01ABC'), '01ABC');
  assert.throws(() => meetingId('https://app.fireflies.ai.evil.example/view/01ABC'), /Fireflies/);
  assert.throws(() => meetingId('https://app.fireflies.ai/settings'), /transcript URL/);
  assert.throws(() => meetingId('http://app.fireflies.ai/view/01ABC'), /HTTPS/);
});

test('UTC calendar ranges include the to-date and reject invalid/ambiguous dates', () => {
  assert.equal(isoDate('2026-10-14'), '2026-10-14T00:00:00.000Z');
  assert.equal(isoDate('2026-10-14', true), '2026-10-15T00:00:00.000Z');
  assert.equal(isoDate('2026-10-14T00:00:00-04:00'), '2026-10-14T04:00:00.000Z');
  assert.throws(() => isoDate('2026-02-30'), /Invalid/);
  assert.throws(() => isoDate('2026-10-14T00:00:00'), /timezone/);
});

test('all-pages retrieval advances raw offsets, deduplicates, and reports exhaustion', async () => {
  const offsets = [];
  const first = Array.from({ length: 50 }, (_, id) => ({ id: String(id) }));
  const result = await listMeetings(async (_query, variables) => {
    offsets.push(variables.skip);
    return { transcripts: variables.skip === 0 ? first : [{ id: '49' }, { id: '50' }] };
  }, { all: true });
  assert.deepEqual(offsets, [0, 50]);
  assert.equal(result.meetings.length, 51);
  assert.equal(result.pagination.complete, true);
  assert.equal(result.pagination.next_skip, null);
});

test('page cap is explicitly incomplete and reports a continuation offset', async () => {
  const result = await listMeetings(async () => ({ transcripts: Array.from({ length: 50 }, (_, id) => ({ id: String(id) })) }),
    { all: true, maxPages: 1, skip: 100 });
  assert.equal(result.pagination.complete, false);
  assert.equal(result.pagination.has_more, null);
  assert.equal(result.pagination.next_skip, 150);
  assert.equal(result.pagination.stopped_because, 'max_pages');
});

test('missing transcripts and malformed list data do not become empty successes', async () => {
  await assert.rejects(readMeeting(async () => ({ transcript: null }), 'missing'), /not found or is not accessible/);
  await assert.rejects(listMeetings(async () => ({ transcripts: null })), /transcript list/);
});

test('sentence selection preserves overlapping evidence and speaker labels', () => {
  const meeting = { sentences: [
    { text: 'Pricing options', speaker_name: 'Jamie', start_time: 10, end_time: 15 },
    { text: 'Review tomorrow', speaker_name: 'Alex', start_time: 16, end_time: 19 },
  ] };
  assert.equal(selectSentences(meeting, { contains: 'PRICING', start: 12, end: 14, speaker: 'jam' }).length, 1);
  assert.equal(selectSentences(meeting, { contains: 'missing' }).length, 0);
  assert.equal(timestamp(3661.5), '1:01:01');
  assert.equal(timestamp(null), '--:--');
  const text = renderMeeting({ ...meeting, title: 'Pricing', transcript_url: 'https://app.fireflies.ai/view/id' });
  assert.match(text, /\[00:10–00:15\] Jamie: Pricing options/);
  assert.match(text, /Source: https:\/\/app.fireflies.ai\/view\/id/);
});

test('CLI search defaults to all, validates bounds, and rejects ignored options', () => {
  const config = parseCommand(['search', 'pricing', '--participant', 'a@example.com', '--participant', 'b@example.com']);
  assert.equal(config.filters.scope, 'all');
  assert.deepEqual(config.filters.participants, ['a@example.com', 'b@example.com']);
  assert.throws(() => parseCommand(['list', '--limit', '51']), /integer/);
  assert.throws(() => parseCommand(['list', '--all', '--limit', '2']), /omit --limit/);
  assert.throws(() => parseCommand(['transcript', 'id', '--all']), /not supported/);
  assert.throws(() => parseCommand(['transcript', 'id', '--start', '10', '--end', '2']), /must not exceed/);
  assert.throws(() => parseCommand(['search', 'x', '--scope', 'unknown']), /--scope/);
  assert.throws(() => parseCommand(['list', '--from', '2026-10-15', '--to', '2026-10-14']), /earlier/);
});

test('environment credentials are trimmed and alias/control validation is strict', () => {
  assert.deepEqual(resolveCredential('default', { FIREFLIES_API_KEY: ' fixture-key\n' }), {
    key: 'fixture-key', source: 'FIREFLIES_API_KEY', alias: 'default',
  });
  assert.throws(() => validateKey('abc\ndef'), /whitespace/);
  assert.throws(() => validateAlias('work\nignored'), /aliases/);
});

const cli = fileURLToPath(new URL('../scripts/fireflies.mjs', import.meta.url));
const preload = fileURLToPath(new URL('./mock-api.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, ['--import', preload, cli, ...args], {
  encoding: 'utf8', env: { ...process.env, FIREFLIES_API_KEY: 'fixture-key' },
});

test('real CLI verifies identity, reads URLs, and exports evidence privately', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fireflies-test-'));
  try {
    const verify = run(['verify', '--expect-email', 'owner@example.com']);
    assert.equal(verify.status, 0, verify.stderr);
    assert.equal(JSON.parse(verify.stdout).user.email, 'owner@example.com');
    const mismatch = run(['list', '--expect-email', 'other@example.com']);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /expected account/);
    const file = join(directory, 'transcript.md');
    const exportResult = run(['transcript', 'https://app.fireflies.ai/view/Pricing::fixture-meeting', '--format', 'markdown', '--output', file]);
    assert.equal(exportResult.status, 0, exportResult.stderr);
    const content = await readFile(file, 'utf8');
    assert.match(content, /# Pricing discussion/);
    assert.match(content, /\[00:10–00:13\] Jamie: Prepare pricing options/);
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
    const duplicate = run(['transcript', 'fixture-meeting', '--output', file]);
    assert.equal(duplicate.status, 1);
    assert.equal(await readFile(file, 'utf8'), content);
    const selected = run(['transcript', 'fixture-meeting', '--contains', 'pricing']);
    assert.equal(JSON.parse(selected.stdout).sentences.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
