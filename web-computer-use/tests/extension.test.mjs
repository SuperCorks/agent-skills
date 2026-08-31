import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsed, taskLink, viewState, iconState, structuralKey, normalizeSelection} from '../extension/model.mjs';

const now = 1800000000000;
const lease = {owner: 'agent', task_name: 'Fix the checkout flow', browser: 'chrome', mode: 'computer-use',
  state: 'held', mode_since: now / 1000 - 61, acquired_at: now / 1000 - 120, expires_at: now / 1000 + 300};
const envelope = (...reservations) => ({selection: 'auto', receivedAt: now,
  snapshot: {status: 'ok', host_browser: 'chrome', sampled_at: now / 1000, reservations}});

test('active Computer Use has green-dot icon, plugin-only and no leases are idle', () => {
  assert.equal(iconState(viewState(envelope(lease), now)), 'active');
  assert.equal(iconState(viewState(envelope({...lease, mode: 'plugin'}), now)), 'idle');
  assert.equal(iconState(viewState(envelope(), now)), 'idle');
  assert.equal(iconState(viewState(envelope({...lease, browser: 'comet'}), now)), 'idle');
  assert.equal(iconState(viewState({...envelope({...lease, browser: 'comet'}), selection: 'comet'}, now)), 'active');
});
test('Brave plugin tasks show their profile without lighting the Computer Use dot', () => {
  const plugin = {...lease, browser: 'brave', mode: 'plugin', profile: 'Work',
    candidates: [{browser: 'brave', mode: 'plugin'}]};
  const data = {...envelope(plugin, lease), selection: 'brave'};
  const view = viewState(data, now);
  assert.equal(view.known, true);
  assert.equal(view.state, 'Plugin · 1');
  assert.equal(iconState(view), 'idle');
  assert.deepEqual(view.reservations, [plugin]);
  assert.equal(view.reservations[0].profile, 'Work');
  assert.equal(view.desktopBlocker, lease);
  assert.equal(viewState({...data, selection: 'chrome'}, now).state, 'Computer Use');
});
test('unsupported plugin browsers fail closed, including queued candidates', () => {
  for (const browser of ['comet', 'safari']) {
    assert.equal(viewState(envelope({...lease, browser, mode: 'plugin'}), now).reason, 'invalid_snapshot');
    const pending = {...lease, state: 'pending', candidates: [{browser, mode: 'plugin'}]};
    assert.equal(viewState(envelope(pending), now).reason, 'invalid_snapshot');
  }
});
test('disconnected, stale and conflicting snapshots cannot show active or free', () => {
  assert.equal(iconState(viewState(null, now)), 'unknown');
  assert.equal(iconState(viewState(envelope(lease), now + 7000)), 'unknown');
  assert.equal(iconState(viewState(envelope(lease, {...lease, browser: 'brave'}), now)), 'unknown');
  assert.equal(iconState(viewState(envelope({...lease, mode: 'bad-mode'}), now)), 'unknown');
  const staleHost = envelope(lease);
  staleHost.snapshot.sampled_at -= 20;
  assert.equal(iconState(viewState(staleHost, now)), 'unknown');
});
test('expired and pending leases do not turn on the green dot', () => {
  assert.equal(iconState(viewState(envelope({...lease, expires_at: now / 1000}), now)), 'idle');
  assert.equal(iconState(viewState(envelope({...lease, state: 'pending'}), now)), 'idle');
});
test('timer advances every second, handles hours, and does not invent legacy timestamps', () => {
  assert.equal(elapsed(lease.mode_since, now), '01:01');
  assert.equal(elapsed(lease.mode_since, now + 1000), '01:02');
  assert.equal(elapsed(now / 1000 - 3661, now), '1:01:01');
  assert.equal(elapsed(null, now), '—:—');
  assert.equal(elapsed(now / 1000 + 10, now), '00:00');
});
test('task links accept only task UUIDs, not arbitrary URLs', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  assert.equal(taskLink(id), `codex://threads/${id}`);
  for (const invalid of ['javascript:alert(1)', 'codex://settings', `${id}?prompt=bad`, null]) assert.equal(taskLink(invalid), null);
});
test('renewals and sampling do not force a DOM rebuild that would steal focus', () => {
  const first = viewState(envelope(lease), now);
  const second = viewState(envelope({...lease, expires_at: lease.expires_at + 5, updated_at: now / 1000}), now + 1000);
  assert.equal(structuralKey(first), structuralKey(second));
  assert.notEqual(structuralKey(first), structuralKey(viewState(envelope({...lease, task_name: 'New title'}), now)));
});
test('only the selected browser is shown, with a separate shared desktop blocker', () => {
  const waiting = {...lease, browser: 'brave', state: 'pending', task_name: 'Waiting task'};
  const view = viewState({...envelope(lease, waiting), selection: 'brave'}, now);
  assert.equal(view.browser, 'brave');
  assert.equal(view.state, 'Waiting');
  assert.equal(view.active, null);
  assert.equal(view.desktopBlocker, lease);
  assert.deepEqual(view.reservations, [waiting]);
  assert.equal(iconState(view), 'idle');
});
test('automatic detection uses the host identity; missing identity requires a choice', () => {
  const data = envelope({...lease, browser: 'comet'});
  data.snapshot.host_browser = 'comet';
  assert.equal(viewState(data, now).browser, 'comet');
  assert.equal(iconState(viewState(data, now)), 'active');
  data.snapshot.host_browser = null;
  assert.equal(viewState(data, now).reason, 'browser_unidentified');
  assert.equal(iconState(viewState(data, now)), 'unknown');
  assert.equal(viewState({...data, selection: 'comet'}, now).known, true);
  assert.equal(viewState({...data, selection: null}, now).reason, 'loading_selection');
});
test('saved manual selections override detection and invalid preferences fall back to auto', () => {
  for (const browser of ['chrome', 'comet', 'brave', 'safari']) {
    assert.equal(viewState({...envelope(), selection: browser}, now).browser, browser);
  }
  assert.equal(normalizeSelection('all'), 'auto');
  assert.equal(normalizeSelection(null), 'auto');
  assert.equal(viewState({...envelope(), selection: 'invalid'}, now).browser, 'chrome');
});
test('shared plugin tasks and fallback queues are filtered to the monitored browser', () => {
  const plugin = {...lease, mode: 'plugin'};
  const pending = {...lease, state: 'pending', candidates: [{browser: 'chrome', mode: 'computer-use'},
    {browser: 'brave', mode: 'computer-use'}]};
  const elsewhere = {...lease, browser: 'comet'};
  const data = envelope(plugin, pending, elsewhere);
  const chrome = viewState(data, now);
  assert.deepEqual(chrome.reservations, [plugin, pending]);
  assert.equal(chrome.state, 'Plugin · 1');
  const brave = viewState({...data, selection: 'brave'}, now);
  assert.deepEqual(brave.reservations, [pending]);
  assert.equal(brave.state, 'Waiting');
  const comet = viewState({...data, selection: 'comet'}, now);
  assert.deepEqual(comet.reservations, [elsewhere]);
  assert.equal(comet.desktopBlocker, null);
  const safari = viewState({...data, selection: 'safari'}, now);
  assert.deepEqual(safari.reservations, []);
  assert.equal(safari.desktopBlocker, elsewhere);
});
test('malformed candidate data fails closed instead of breaking browser filtering', () => {
  const data = envelope({...lease, state: 'pending', candidates: [null]});
  assert.equal(viewState(data, now).reason, 'invalid_snapshot');
});
