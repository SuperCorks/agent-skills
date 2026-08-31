const started = Date.now() / 1000 - 142;
export function previewSnapshot(mode = 'active') {
  if (mode === 'offline') return {status: 'error', code: 'disconnected', host_browser: 'chrome'};
  const sampled_at = Date.now() / 1000;
  const base = {state: 'held', owner: 'preview-agent', browser: 'chrome', profile: 'Default',
    mode: 'computer-use', task_name: 'Build the browser status extension',
    thread_id: '00000000-0000-4000-8000-000000000000', mode_since: started, acquired_at: started,
    expires_at: sampled_at + 300, candidates: [{browser: 'chrome', mode: 'computer-use'}]};
  const reservations = mode === 'idle' ? [] : mode === 'mixed'
    ? [{...base, mode: 'plugin', task_name: 'Review the latest design changes'},
      {...base, browser: 'comet', profile: null, task_name: 'Check the booking flow'},
      {...base, browser: 'brave', state: 'pending', queued_at: started,
        task_name: 'Inspect the dashboard', candidates: [{browser: 'brave', mode: 'computer-use'}]}]
    : mode === 'shared'
    ? [{...base, mode: 'plugin', task_name: 'Review the latest design changes'}]
    : [base];
  return {status: 'ok', host_browser: mode === 'unidentified' ? null : 'chrome', sampled_at, reservations};
}
