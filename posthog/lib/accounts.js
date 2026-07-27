const { SkillError } = require('./errors');

const DEFAULT_HOST = 'https://us.posthog.com';

function parseAccounts(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(envValue);
  } catch (error) {
    throw new SkillError('POSTHOG_ACCOUNTS_INVALID', `Invalid JSON: ${error.message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkillError('POSTHOG_ACCOUNTS_INVALID', 'Expected a JSON object');
  }

  const accounts = new Map();
  for (const [name, value] of Object.entries(parsed)) {
    if (!name.trim()) {
      throw new SkillError('POSTHOG_ACCOUNTS_INVALID', 'Account aliases cannot be empty');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SkillError(
        'POSTHOG_ACCOUNTS_INVALID',
        `Account "${name}" must be an object with apiKey, host, and optional projectId`
      );
    }

    const apiKey = normalizeString(value.apiKey || value.personalApiKey || value.token);
    const host = normalizeHost(value.host || value.baseUrl || value.appHost || DEFAULT_HOST);
    const projectId = normalizeProjectId(value.projectId ?? value.project ?? value.environmentId);

    if (!apiKey) {
      throw new SkillError(
        'POSTHOG_ACCOUNTS_INVALID',
        `Account "${name}" must include apiKey, personalApiKey, or token`
      );
    }

    accounts.set(name, { apiKey, host, projectId });
  }

  return accounts;
}

function getConfiguredAccounts(env = process.env) {
  if (env.POSTHOG_ACCOUNTS && env.POSTHOG_ACCOUNTS.trim()) {
    return parseAccounts(env.POSTHOG_ACCOUNTS);
  }

  const apiKey = normalizeString(env.POSTHOG_PERSONAL_API_KEY);
  if (!apiKey) {
    return new Map();
  }

  return new Map([
    [
      'default',
      {
        apiKey,
        host: normalizeHost(env.POSTHOG_HOST || DEFAULT_HOST),
        projectId: normalizeProjectId(env.POSTHOG_PROJECT_ID),
      },
    ],
  ]);
}

function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('POSTHOG_AUTH_MISSING');
  }

  if (specifiedName) {
    const account = accounts.get(specifiedName);
    if (!account) {
      throw new SkillError(
        'POSTHOG_ACCOUNT_NOT_FOUND',
        `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`
      );
    }
    return { name: specifiedName, ...account };
  }

  if (accounts.size === 1) {
    const [name, account] = [...accounts.entries()][0];
    return { name, ...account };
  }

  throw new SkillError(
    'POSTHOG_ACCOUNT_AMBIGUOUS',
    `Available accounts: ${[...accounts.keys()].join(', ')}`
  );
}

function resolveProjectId(account, specifiedProjectId, required = true) {
  const projectId = normalizeProjectId(specifiedProjectId ?? account.projectId);
  if (!projectId && required) {
    throw new SkillError('POSTHOG_PROJECT_REQUIRED');
  }
  return projectId;
}

function normalizeHost(value) {
  const text = normalizeString(value);
  if (!text) {
    return DEFAULT_HOST;
  }

  let url;
  try {
    url = new URL(text);
  } catch (error) {
    throw new SkillError('POSTHOG_ACCOUNTS_INVALID', `Invalid host "${text}"`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new SkillError('POSTHOG_ACCOUNTS_INVALID', `Invalid private API host "${text}"`);
  }

  if (url.pathname !== '/') {
    throw new SkillError(
      'POSTHOG_ACCOUNTS_INVALID',
      `Private API host must not include a path: "${text}"`
    );
  }

  if (/^(us|eu)\.i\.posthog\.com$/i.test(url.hostname)) {
    throw new SkillError(
      'POSTHOG_ACCOUNTS_INVALID',
      `Use the private API host without ".i": ${url.hostname.replace('.i.', '.')}`
    );
  }

  return url.toString().replace(/\/$/, '');
}

function normalizeProjectId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const projectId = String(value).trim();
  return projectId || undefined;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

module.exports = {
  DEFAULT_HOST,
  parseAccounts,
  getConfiguredAccounts,
  resolveAccount,
  resolveProjectId,
  normalizeHost,
  normalizeProjectId,
};
