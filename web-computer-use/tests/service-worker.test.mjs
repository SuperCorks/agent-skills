import test from 'node:test';
import assert from 'node:assert/strict';

function event() {
  const handlers = [];
  return {addListener: handler => handlers.push(handler), emit: (...values) => handlers.forEach(handler => handler(...values))};
}

function port(name) {
  return {name, onMessage: event(), onDisconnect: event(), messages: [],
    postMessage(value) { this.messages.push(value); }};
}

test('native updates drive the toolbar and popup; stale/disconnected streams clear activity and reconnect', async t => {
  const originalChrome = globalThis.chrome;
  const originalInterval = globalThis.setInterval;
  const originalNow = Date.now;
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
    globalThis.setInterval = originalInterval;
    Date.now = originalNow;
  });
  let now = 1800000000000;
  Date.now = () => now;
  let tick;
  globalThis.setInterval = callback => { tick = callback; };
  const calls = {icons: [], badges: [], titles: [], alarms: []};
  const nativePorts = [];
  const runtime = {onConnect: event(), onStartup: event(), onInstalled: event(),
    connectNative(name) {
      assert.equal(name, 'com.supercorks.web_computer_use');
      const native = port(name);
      nativePorts.push(native);
      return native;
    }};
  globalThis.chrome = {runtime,
    storage: {onChanged: event(), local: {get: async () => ({browserSelection: 'brave'})}},
    action: {setIcon: value => calls.icons.push(value), setBadgeText: value => calls.badges.push(value),
      setTitle: value => calls.titles.push(value), setBadgeBackgroundColor() {}},
    alarms: {onAlarm: event(), clear() {}, create: (name, options) => calls.alarms.push({name, options})}};
  await import('../extension/service-worker.mjs');

  const native = nativePorts[0];
  assert.deepEqual(native.messages, [{type: 'subscribe'}]);
  assert.equal(calls.badges.at(-1).text, '?');
  const popup = port('status-popup');
  runtime.onConnect.emit(popup);
  const active = {owner: 'agent', task_name: 'Check the booking flow', browser: 'brave',
    state: 'held', mode: 'computer-use', expires_at: now / 1000 + 300};
  const snapshot = reservations => ({status: 'ok', host_browser: 'chrome', sampled_at: now / 1000, reservations});
  native.onMessage.emit(snapshot([active]));
  assert.equal(calls.icons.at(-1).path[16], 'icons/active-16.png');
  assert.equal(calls.badges.at(-1).text, '');
  assert.match(calls.titles.at(-1).title, /Brave.*Check the booking flow/);
  assert.equal(popup.messages.at(-1).snapshot.reservations[0].task_name, active.task_name);
  assert.equal(popup.messages.at(-1).selection, 'brave', 'restore the saved choice on worker startup');
  chrome.storage.onChanged.emit({browserSelection: {newValue: 'auto'}}, 'local');
  assert.equal(calls.icons.at(-1).path[16], 'icons/idle-16.png');
  assert.match(calls.titles.at(-1).title, /Chrome.*desktop reserved in Brave/);
  assert.equal(popup.messages.at(-1).selection, 'auto');
  chrome.storage.onChanged.emit({browserSelection: {newValue: 'safari'}}, 'sync');
  assert.equal(popup.messages.at(-1).selection, 'auto', 'ignore other storage areas');
  chrome.storage.onChanged.emit({browserSelection: {newValue: 'brave'}}, 'local');
  assert.equal(calls.icons.at(-1).path[16], 'icons/active-16.png');
  popup.onMessage.emit({type: 'refresh'});
  assert.deepEqual(native.messages.at(-1), {type: 'getStatus'});

  now += 7000;
  tick();
  assert.equal(calls.icons.at(-1).path[16], 'icons/idle-16.png');
  assert.equal(calls.badges.at(-1).text, '?');
  native.onMessage.emit(snapshot([]));
  assert.equal(calls.badges.at(-1).text, '');
  assert.match(calls.titles.at(-1).title, /Brave.*idle/);
  native.onDisconnect.emit();
  assert.equal(calls.badges.at(-1).text, '?');
  assert.equal(popup.messages.at(-1).snapshot.code, 'disconnected');
  assert.deepEqual(calls.alarms.at(-1), {name: 'reconnect', options: {delayInMinutes: 0.5}});
  chrome.alarms.onAlarm.emit({name: 'reconnect'});
  assert.equal(nativePorts.length, 2);
  assert.deepEqual(nativePorts[1].messages, [{type: 'subscribe'}]);
  native.onMessage.emit(snapshot([active]));
  assert.equal(calls.badges.at(-1).text, '?', 'superseded connection must not restore activity');
  nativePorts[1].onMessage.emit(snapshot([active]));
  assert.equal(calls.icons.at(-1).path[16], 'icons/active-16.png');
  popup.onDisconnect.emit();
  const delivered = popup.messages.length;
  tick();
  assert.equal(popup.messages.length, delivered);
});

test('loading saved preferences never flashes the wrong browser or overwrites a newer choice', async t => {
  const previous = {chrome: globalThis.chrome, setInterval: globalThis.setInterval};
  t.after(() => {
    if (previous.chrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous.chrome;
    globalThis.setInterval = previous.setInterval;
  });
  globalThis.setInterval = () => {};
  let finishLoad;
  const initialRead = new Promise(resolve => { finishLoad = resolve; });
  const native = port('native');
  const icons = [];
  globalThis.chrome = {
    runtime: {onConnect: event(), onStartup: event(), onInstalled: event(), connectNative: () => native},
    storage: {onChanged: event(), local: {get: () => initialRead}},
    action: {setIcon: value => icons.push(value), setBadgeText() {}, setTitle() {}, setBadgeBackgroundColor() {}},
    alarms: {onAlarm: event(), clear() {}, create() {}},
  };
  await import('../extension/service-worker.mjs?delayed-preferences');
  const popup = port('status-popup');
  chrome.runtime.onConnect.emit(popup);
  native.onMessage.emit({status: 'ok', host_browser: 'chrome', sampled_at: Date.now() / 1000,
    reservations: [{owner: 'agent', browser: 'chrome', mode: 'computer-use', state: 'held', expires_at: Date.now() / 1000 + 300}]});
  assert.equal(popup.messages.at(-1).selection, null);
  assert.equal(icons.at(-1).path[16], 'icons/idle-16.png');
  chrome.storage.onChanged.emit({browserSelection: {newValue: 'chrome'}}, 'local');
  assert.equal(icons.at(-1).path[16], 'icons/active-16.png');
  finishLoad({browserSelection: 'brave'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(popup.messages.at(-1).selection, 'chrome');
  assert.equal(icons.at(-1).path[16], 'icons/active-16.png');
});

test('a failed preference read reports the error and safely uses automatic detection', async t => {
  const previous = {chrome: globalThis.chrome, setInterval: globalThis.setInterval};
  t.after(() => {
    if (previous.chrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous.chrome;
    globalThis.setInterval = previous.setInterval;
  });
  globalThis.setInterval = () => {};
  const native = port('native');
  globalThis.chrome = {
    runtime: {onConnect: event(), onStartup: event(), onInstalled: event(), connectNative: () => native},
    storage: {onChanged: event(), local: {get: async () => { throw new Error('storage failed'); }}},
    action: {setIcon() {}, setBadgeText() {}, setTitle() {}, setBadgeBackgroundColor() {}},
    alarms: {onAlarm: event(), clear() {}, create() {}},
  };
  await import('../extension/service-worker.mjs?unavailable-preferences');
  const popup = port('status-popup');
  chrome.runtime.onConnect.emit(popup);
  assert.equal(popup.messages.at(-1).selection, 'auto');
  assert.equal(popup.messages.at(-1).selectionError, true);
  chrome.storage.onChanged.emit({browserSelection: {newValue: 'comet'}}, 'local');
  assert.equal(popup.messages.at(-1).selection, 'comet');
  assert.equal(popup.messages.at(-1).selectionError, false);
});
