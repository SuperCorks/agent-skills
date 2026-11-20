// What Pastel says about the token in use: its name, scope, and expiry.
// Personal access tokens (`pstl_...`) are listed by GET /users/me/access-tokens with a
// `tokenPrefix` such as "pstl_pat_c17295fd...". Legacy API tokens are not listed there
// and stop working on LEGACY_CUTOFF.

const LEGACY_CUTOFF = '2027-02-15T00:00:00.000Z';
const DEFAULT_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isAccessToken(token) {
  return typeof token === 'string' && token.startsWith('pstl_');
}

function findTokenRecord(token, records) {
  if (!isAccessToken(token) || !Array.isArray(records)) return null;
  const live = records.filter((record) => record && !record.deletedAt && typeof record.tokenPrefix === 'string');
  const matches = live.filter((record) => {
    const prefix = record.tokenPrefix.replace(/\.{3}$|…$/, '');
    return prefix.length > 0 && token.startsWith(prefix);
  });
  // The longest prefix wins if several ever overlap.
  matches.sort((a, b) => b.tokenPrefix.length - a.tokenPrefix.length);
  return matches[0] || null;
}

function daysUntil(date, now) {
  return Math.floor((new Date(date).getTime() - now.getTime()) / DAY_MS);
}

// Returns { kind, name, audience, expiresAt, daysLeft, lastUsedAt, status, warnings }.
// status is "ok", "expiring", "expired", "legacy", or "unknown".
function describeToken(token, records, { now = new Date(), warnDays = DEFAULT_WARN_DAYS } = {}) {
  const warnings = [];

  if (!isAccessToken(token)) {
    const daysLeft = daysUntil(LEGACY_CUTOFF, now);
    warnings.push(
      daysLeft >= 0
        ? `Legacy API token: it stops working on ${LEGACY_CUTOFF.slice(0, 10)} (${daysLeft} days). Create a personal access token with API access at https://usepastel.com/settings/integrations and run auth.js replace.`
        : `Legacy API token: Pastel stopped accepting these on ${LEGACY_CUTOFF.slice(0, 10)}. Create a personal access token at https://usepastel.com/settings/integrations.`,
    );
    return { kind: 'legacy', name: null, audience: null, expiresAt: LEGACY_CUTOFF, daysLeft, lastUsedAt: null, status: 'legacy', warnings };
  }

  const record = findTokenRecord(token, records);
  if (!record) {
    warnings.push('Pastel did not list this token under GET /users/me/access-tokens, so its expiry is unknown.');
    return { kind: 'access', name: null, audience: null, expiresAt: null, daysLeft: null, lastUsedAt: null, status: 'unknown', warnings };
  }

  const expiresAt = record.expiresAt || null;
  const daysLeft = expiresAt ? daysUntil(expiresAt, now) : null;
  let status = 'ok';
  if (daysLeft !== null && new Date(expiresAt) <= now) {
    status = 'expired';
    warnings.push(`Token "${record.name}" expired on ${expiresAt.slice(0, 10)}. Create a new one at https://usepastel.com/settings/integrations and run auth.js replace.`);
  } else if (daysLeft !== null && daysLeft <= warnDays) {
    status = 'expiring';
    warnings.push(`Token "${record.name}" expires on ${expiresAt.slice(0, 10)} (${daysLeft} days). Create a new one at https://usepastel.com/settings/integrations and run auth.js replace.`);
  }
  if (record.audience && record.audience !== 'api') {
    warnings.push(`Token "${record.name}" is scoped to "${record.audience}", not "api"; API calls may be refused.`);
  }

  return {
    kind: 'access',
    name: record.name || null,
    audience: record.audience || null,
    expiresAt,
    daysLeft,
    lastUsedAt: record.lastUsedAt || null,
    status,
    warnings,
  };
}

module.exports = { LEGACY_CUTOFF, DEFAULT_WARN_DAYS, isAccessToken, findTokenRecord, describeToken };
