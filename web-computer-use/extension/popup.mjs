import {LABELS, elapsed, taskLink, viewState, structuralKey, SELECTION_KEY, normalizeSelection} from './model.mjs';

let envelope = null;
let signature = null;
let port = null;
let saving = false;
let saveError = false;
const installed = !!globalThis.chrome?.runtime?.id;
const activity = document.querySelector('#activity');
const browserSelect = document.querySelector('#browser-select');
const desktopBlocker = document.querySelector('#desktop-blocker');
const tasks = document.querySelector('#tasks');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function taskTitle(lease) {
  const url = taskLink(lease.thread_id);
  const node = element(url ? 'a' : 'span', 'task-title', lease.task_name || lease.owner || 'Unnamed task');
  if (url) {
    node.href = url;
    node.target = '_blank';
    node.rel = 'noreferrer';
    node.title = 'Open task in Codex';
    node.append(element('span', 'arrow', '↗'));
  }
  return node;
}

function timer(since, className) {
  const node = element('span', className, elapsed(since));
  if (typeof since === 'number') node.dataset.since = since;
  node.setAttribute('aria-label', 'Elapsed reservation time');
  node.setAttribute('aria-live', 'off');
  return node;
}

function render() {
  const view = viewState(envelope);
  browserSelect.disabled = saving || (installed && (!envelope || envelope.selection === null));
  if (!saving) browserSelect.value = view.selection;
  browserSelect.querySelector('[value="auto"]').textContent = view.detected ? `Automatic (${LABELS[view.detected]})` : 'Automatic';
  document.querySelector('#selection-feedback').textContent = saving ? 'Saving…'
    : saveError ? 'Could not save this choice. Please try again.'
    : envelope?.selectionError ? 'Saved choice unavailable; using Automatic for now.'
    : view.selection !== 'auto' ? `Monitoring ${LABELS[view.browser] || LABELS[view.selection]} · ${installed ? 'saved for this extension profile' : 'preview only'}.`
    : view.detected ? `Detected ${LABELS[view.detected]} as the browser running this extension.`
    : 'Waiting for browser detection. You can also choose a browser above.';
  const key = structuralKey(view);
  if (key !== signature) {
    signature = key;
    activity.replaceChildren();
    const card = element('div', `activity-card ${!view.known ? 'unknown' : view.active ? 'active' : 'idle'}`);
    const line = element('div', 'state-line');
    const browserLabel = view.browser ? `${LABELS[view.browser]} · ` : '';
    line.append(element('span', 'dot'), element('span', '', !view.known ? `${browserLabel}Status unavailable`
      : `${browserLabel}${view.active ? 'Computer Use is active' : view.state === 'Free' ? 'Computer Use is idle' : view.state}`));
    card.append(line);
    if (view.active) {
      card.append(timer(view.active.mode_since, 'timer'), taskTitle(view.active));
      const parts = [LABELS[view.active.browser], view.active.profile];
      if (Number.isFinite(view.active.mode_since)) parts.push(`since ${new Date(view.active.mode_since * 1000).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`);
      card.append(element('p', 'detail', parts.filter(Boolean).join(' · ')));
    } else {
      const unidentified = view.reason === 'browser_unidentified';
      card.append(element('h3', 'idle-title', !view.known ? unidentified ? 'Choose your browser.' : 'Let’s reconnect.'
        : view.desktopBlocker ? 'Desktop busy elsewhere.' : view.state === 'Free' ? 'Ready when you are.'
        : view.state === 'Waiting' ? 'Waiting for access.' : 'Plugin work in progress.'));
      card.append(element('p', 'explanation', !view.known ? unidentified
        ? 'Automatic detection could not identify this browser. Select one above; no browser is assumed.'
        : 'The local status helper is unavailable or its data is stale. Refresh, or check the native-host setup.'
        : view.desktopBlocker ? `No Computer Use task holds ${LABELS[view.browser]}, but the shared desktop is reserved in ${LABELS[view.desktopBlocker.browser]}.`
        : view.state === 'Free' ? `No task currently reserves ${LABELS[view.browser]}.`
        : 'This browser’s reservations are shown below.'));
    }
    activity.append(card);
    desktopBlocker.replaceChildren();
    desktopBlocker.hidden = !view.desktopBlocker;
    if (view.desktopBlocker) {
      const blocker = view.desktopBlocker;
      desktopBlocker.append(element('h2', '', `Desktop reserved in ${LABELS[blocker.browser]}`), taskTitle(blocker));
      const detail = element('p', 'detail');
      detail.append(element('span', '', 'Shared desktop'), timer(blocker.mode_since, 'small-timer'));
      desktopBlocker.append(detail);
    }
    tasks.replaceChildren();
    const others = view.reservations.filter(lease => lease !== view.active);
    document.querySelector('#tasks-section').hidden = !others.length;
    for (const lease of others) {
      const row = element('div', 'task-row');
      const detail = element('p', 'detail');
      const waiting = lease.state === 'pending';
      detail.append(element('span', '', `${LABELS[view.browser]} · ${waiting ? 'Waiting' : 'Plugin'}`),
        timer(waiting ? lease.queued_at : lease.acquired_at, 'small-timer'));
      row.append(taskTitle(lease), detail);
      tasks.append(row);
    }
  }
  for (const node of document.querySelectorAll('[data-since]')) node.textContent = elapsed(Number(node.dataset.since));
  document.querySelector('#freshness').textContent = view.known ? '● Connected · updates live'
    : view.reason === 'browser_unidentified' ? '● Connected · choose a browser' : '○ Not connected';
}

function connect() {
  if (!installed) return;
  try {
    port = chrome.runtime.connect({name: 'status-popup'});
    port.onMessage.addListener(value => { envelope = value; render(); });
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; port = null; envelope = null; render(); });
    port.postMessage({type: 'refresh'});
  } catch { envelope = null; render(); }
}

document.querySelector('#refresh').addEventListener('click', () => {
  if (port) port.postMessage({type: 'refresh'});
  else connect();
});
browserSelect.addEventListener('change', async () => {
  const selection = normalizeSelection(browserSelect.value);
  saving = true;
  saveError = false;
  render();
  try {
    if (installed) await chrome.storage.local.set({[SELECTION_KEY]: selection});
    envelope = {...envelope, selection, selectionError: false};
  } catch { saveError = true; }
  finally { saving = false; render(); }
});
// Explicit, visibly labelled local preview. Never enabled in an installed
// extension; no fixture can override real reservation data there.
if (!installed && new URL(location.href).searchParams.has('demo')) {
  const {previewSnapshot} = await import('./preview-data.mjs');
  document.querySelector('#preview').hidden = false;
  const demo = new URL(location.href).searchParams.get('demo');
  const updatePreview = () => { envelope = {...envelope, snapshot: previewSnapshot(demo), receivedAt: Date.now(),
    selection: envelope?.selection || 'auto'}; render(); };
  setInterval(updatePreview, 1000);
  updatePreview();
} else connect();
render();
setInterval(render, 1000);
