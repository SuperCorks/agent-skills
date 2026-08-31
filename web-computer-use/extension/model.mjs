export const BROWSERS = ['chrome', 'comet', 'brave', 'safari'];
export const LABELS = {chrome: 'Chrome', comet: 'Comet', brave: 'Brave', safari: 'Safari'};
export const STALE_MS = 6000;
export const SELECTION_KEY = 'browserSelection';
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function normalizeSelection(value) {
  return BROWSERS.includes(value) ? value : 'auto';
}

export function taskLink(id) {
  return typeof id === 'string' && UUID.test(id) ? `codex://threads/${id}` : null;
}

export function elapsed(since, now = Date.now()) {
  if (typeof since !== 'number' || !Number.isFinite(since)) return '—:—';
  const seconds = Math.max(0, Math.floor(now / 1000 - since));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${String(minutes).padStart(2, '0')}:${remainder}`;
}

export function viewState(envelope, now = Date.now()) {
  const snapshot = envelope?.snapshot;
  const selection = normalizeSelection(envelope?.selection);
  const detected = BROWSERS.includes(snapshot?.host_browser) ? snapshot.host_browser : null;
  const browser = envelope?.selection === null ? null : selection === 'auto' ? detected : selection;
  const unknown = reason => ({known: false, browser, selection, detected, active: null,
    desktopBlocker: null, reservations: [], reason, state: 'Unknown'});
  const age = now - (envelope?.receivedAt || 0);
  const valid = snapshot?.status === 'ok' && Array.isArray(snapshot.reservations)
    && Number.isFinite(snapshot.sampled_at) && Math.abs(now - snapshot.sampled_at * 1000) <= STALE_MS
    && age >= 0 && age <= STALE_MS;
  if (!valid) return unknown(snapshot?.code || (snapshot?.status === 'ok' ? 'stale' : 'disconnected'));
  const wellFormed = snapshot.reservations.every(lease => lease && BROWSERS.includes(lease.browser)
    && ['plugin', 'computer-use'].includes(lease.mode) && ['held', 'pending'].includes(lease.state)
    && (lease.mode !== 'plugin' || lease.browser === 'chrome') && Number.isFinite(lease.expires_at)
    && (lease.candidates == null || (Array.isArray(lease.candidates)
      && lease.candidates.every(candidate => candidate && BROWSERS.includes(candidate.browser)
        && ['plugin', 'computer-use'].includes(candidate.mode)))));
  if (!wellFormed) return unknown('invalid_snapshot');
  const all = snapshot.reservations.filter(lease => lease.expires_at * 1000 > now);
  const desktop = all.filter(lease => lease.state === 'held' && lease.mode === 'computer-use');
  if (desktop.length > 1) return unknown('conflicting_reservations');
  if (!browser) return unknown(envelope?.selection === null ? 'loading_selection' : 'browser_unidentified');
  const reservations = all.filter(lease => lease.browser === browser || (lease.state === 'pending'
    && Array.isArray(lease.candidates) && lease.candidates.some(candidate => candidate.browser === browser)));
  const active = desktop.find(lease => lease.browser === browser) || null;
  const desktopBlocker = desktop.find(lease => lease.browser !== browser) || null;
  const held = reservations.filter(lease => lease.state === 'held');
  const waiting = reservations.filter(lease => lease.state === 'pending').length;
  const state = active ? 'Computer Use' : held.length ? `Plugin · ${held.length}` : waiting ? 'Waiting' : 'Free';
  return {known: true, browser, selection, detected, active, desktopBlocker, reservations, state, waiting};
}

export function iconState(view) {
  return !view.known ? 'unknown' : view.active ? 'active' : 'idle';
}

export function structuralKey(view) {
  const identity = ({owner, browser, mode, state, profile, task_name, thread_id, mode_since, acquired_at, queued_at}) =>
    ({owner, browser, mode, state, profile, task_name, thread_id, mode_since, acquired_at, queued_at});
  return JSON.stringify({known: view.known, reason: view.reason, browser: view.browser, state: view.state,
    desktopBlocker: view.desktopBlocker && identity(view.desktopBlocker),
    reservations: view.reservations.map(identity)});
}
