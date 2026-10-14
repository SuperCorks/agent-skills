export const ENDPOINT = 'https://api.fireflies.ai/graphql';

export class FirefliesError extends Error {
  constructor(message, { codes = [], status = null, retryAfterSeconds = null } = {}) {
    super(message);
    this.name = 'FirefliesError';
    this.codes = codes;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function retryDelay(response, errors = [], now = Date.now()) {
  const header = response.headers.get('retry-after');
  if (header !== null) {
    const seconds = /^\d+(\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000;
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  }
  const resets = errors.map(error => Number(error.extensions?.metadata?.retryAfter))
    .filter(value => Number.isFinite(value) && value > 0);
  // Fireflies metadata.retryAfter is an epoch timestamp in milliseconds.
  if (resets.length) return Math.max(0, Math.ceil((Math.max(...resets) - now) / 1000));
  const reset = response.headers.get('x-ratelimit-reset');
  if (reset !== null && Number.isFinite(Number(reset))) return Math.max(0, Math.ceil(Number(reset)));
  return null;
}

export function createClient(key, {
  fetchImpl = globalThis.fetch,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  now = Date.now,
  maxRetries = 2,
  maxWaitSeconds = 30,
} = {}) {
  const redact = value => String(value).replaceAll(key, '[redacted]');
  return async function query(document, variables = {}) {
    // Only bundled query operations are exposed; there is no raw mutation escape hatch.
    if (!/^\s*query\b/.test(document)) throw new Error('Only read-only GraphQL queries are supported.');
    let waited = 0;
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: document, variables }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new FirefliesError('Fireflies request failed or timed out. Check connectivity and retry.');
      }
      let body;
      try { body = await response.json(); } catch { body = null; }
      const errors = Array.isArray(body?.errors) ? body.errors : [];
      const codes = errors.map(error => error.code ?? error.extensions?.code).filter(Boolean);
      const limited = response.status === 429 || errors.some(error =>
        error.extensions?.status === 429 || /too_many_requests|rate_limit/i.test(error.code ?? error.extensions?.code ?? ''));
      if (limited) {
        const delay = retryDelay(response, errors, now());
        if (delay !== null && attempt < maxRetries && waited + delay <= maxWaitSeconds) {
          const wait = Math.max(1, delay);
          if (waited + wait <= maxWaitSeconds) {
            await sleep(wait * 1000);
            waited += wait;
            continue;
          }
        }
        throw new FirefliesError(`Fireflies rate limit reached.${delay === null ? ' Retry later.' : ` Retry after ${delay} seconds.`}`, {
          codes, status: response.status, retryAfterSeconds: delay,
        });
      }
      if (!response.ok || errors.length) {
        const details = errors.map(error => redact(error.message ?? 'GraphQL error')).join('; ');
        throw new FirefliesError(details || `Fireflies returned HTTP ${response.status}.`, {
          codes: codes.map(redact), status: response.status,
        });
      }
      if (!body?.data || typeof body.data !== 'object') {
        throw new FirefliesError('Fireflies returned no GraphQL data.');
      }
      return body.data;
    }
  };
}
