import {viewState, iconState, LABELS, SELECTION_KEY, normalizeSelection} from './model.mjs';

const HOST = 'com.supercorks.web_computer_use';
const listeners = new Set();
let nativePort = null;
let envelope = {snapshot: {status: 'error', code: 'connecting'}, receivedAt: 0};
let previousIcon = '';
let selection = null;
let selectionError = false;
let selectionRevision = 0;

function currentEnvelope() { return {...envelope, selection, selectionError}; }

function publish() {
  const value = currentEnvelope();
  const view = viewState(value);
  const icon = iconState(view);
  if (icon !== previousIcon) {
    previousIcon = icon;
    const asset = icon === 'active' ? 'active' : 'idle';
    chrome.action.setIcon({path: {16: `icons/${asset}-16.png`, 32: `icons/${asset}-32.png`}});
    chrome.action.setBadgeText({text: icon === 'unknown' ? '?' : ''});
    chrome.action.setBadgeBackgroundColor({color: '#6b7280'});
  }
  const title = view.reason === 'browser_unidentified' ? 'Web Computer Use — choose a browser'
    : !view.known ? 'Web Computer Use — status unavailable'
    : view.active ? `Computer Use active in ${LABELS[view.active.browser]} — ${view.active.task_name || view.active.owner}`
    : view.desktopBlocker ? `${LABELS[view.browser]} — desktop reserved in ${LABELS[view.desktopBlocker.browser]}`
    : `${LABELS[view.browser]} — ${view.state === 'Free' ? 'idle' : view.state}`;
  chrome.action.setTitle({title});
  for (const listener of listeners) {
    try { listener.postMessage(value); } catch { listeners.delete(listener); }
  }
}

function connect() {
  if (nativePort) return;
  envelope = {snapshot: {status: 'error', code: 'connecting'}, receivedAt: Date.now()};
  publish();
  try {
    const port = chrome.runtime.connectNative(HOST);
    nativePort = port;
    port.onMessage.addListener(snapshot => {
      if (port !== nativePort) return;
      envelope = {snapshot, receivedAt: Date.now()};
      chrome.alarms.clear('reconnect');
      publish();
    });
    port.onDisconnect.addListener(() => {
      // Read lastError to acknowledge Chrome's diagnostic without sending raw
      // paths or exception details to the popup.
      void chrome.runtime.lastError;
      if (port !== nativePort) return;
      nativePort = null;
      envelope = {snapshot: {status: 'error', code: 'disconnected'}, receivedAt: Date.now()};
      publish();
      chrome.alarms.create('reconnect', {delayInMinutes: 0.5});
    });
    port.postMessage({type: 'subscribe'});
  } catch {
    nativePort = null;
    envelope = {snapshot: {status: 'error', code: 'disconnected'}, receivedAt: Date.now()};
    publish();
    chrome.alarms.create('reconnect', {delayInMinutes: 0.5});
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'status-popup') return;
  listeners.add(port);
  port.postMessage(currentEnvelope());
  port.onDisconnect.addListener(() => listeners.delete(port));
  port.onMessage.addListener(message => {
    if (message?.type === 'refresh') {
      if (nativePort) nativePort.postMessage({type: 'getStatus'});
      else connect();
    }
  });
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect') connect(); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.hasOwn(changes, SELECTION_KEY)) return;
  selectionRevision++;
  selection = normalizeSelection(changes[SELECTION_KEY].newValue);
  selectionError = false;
  publish();
});
// Do not briefly show another browser while a saved manual choice is loading.
chrome.storage.local.get(SELECTION_KEY).then(values => {
  if (!selectionRevision) selection = normalizeSelection(values[SELECTION_KEY]);
  publish();
}).catch(() => {
  if (!selectionRevision) { selection = 'auto'; selectionError = true; }
  publish();
});
// The native port keeps this worker alive. A stale stream loses its green dot
// even if the underlying process has not disconnected yet.
setInterval(publish, 1000);
connect();
