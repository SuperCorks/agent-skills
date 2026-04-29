const { SkillError } = require('./errors');

function parseAccounts(envValue, fallbackEnv = process.env) {
  if (!envValue || envValue.trim() === '') {
    return fallbackAccountMap(fallbackEnv);
  }

  try {
    const parsed = JSON.parse(envValue);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillError('BROWSERBASE_AUTH_INVALID', 'BROWSERBASE_ACCOUNTS must be a JSON object');
    }

    const accounts = new Map();
    for (const [name, value] of Object.entries(parsed)) {
      const credentials = normalizeAccountValue(name, value);
      accounts.set(name, credentials);
    }

    return accounts;
  } catch (error) {
    if (error instanceof SkillError) {
      throw error;
    }

    throw new SkillError('BROWSERBASE_AUTH_INVALID', `Invalid JSON in BROWSERBASE_ACCOUNTS: ${error.message}`);
  }
}

function fallbackAccountMap(env) {
  const apiKey = normalizeString(env.BROWSERBASE_API_KEY);
  if (!apiKey) {
    return new Map();
  }

  return new Map([
    ['default', {
      apiKey,
      projectId: normalizeString(env.BROWSERBASE_PROJECT_ID),
      contextId: normalizeString(env.BROWSERBASE_CONTEXT_ID),
      baseUrl: normalizeString(env.BROWSERBASE_BASE_URL),
    }],
  ]);
}

function normalizeAccountValue(name, value) {
  if (typeof value === 'string') {
    const apiKey = normalizeString(value);
    if (!apiKey) {
      throw new SkillError('BROWSERBASE_AUTH_INVALID', `Account "${name}" has an empty API key`);
    }

    return { apiKey };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SkillError(
      'BROWSERBASE_AUTH_INVALID',
      `Account "${name}" must be an object with apiKey and optional projectId/contextId fields`
    );
  }

  const apiKey = normalizeString(value.apiKey || value.key || value.token);
  const projectId = normalizeString(value.projectId || value.project || value.projectID);
  const contextId = normalizeString(value.contextId || value.context || value.contextID);
  const baseUrl = normalizeString(value.baseUrl || value.apiUrl);

  if (!apiKey) {
    throw new SkillError('BROWSERBASE_AUTH_INVALID', `Account "${name}" must include apiKey`);
  }

  return { apiKey, projectId, contextId, baseUrl };
}

function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('BROWSERBASE_AUTH_MISSING');
  }

  if (accounts.size === 1 && !specifiedName) {
    const [name, credentials] = [...accounts.entries()][0];
    return { name, ...credentials };
  }

  if (!specifiedName) {
    throw new SkillError('BROWSERBASE_ACCOUNT_AMBIGUOUS', `Available accounts: ${[...accounts.keys()].join(', ')}`);
  }

  const credentials = accounts.get(specifiedName);
  if (!credentials) {
    throw new SkillError(
      'BROWSERBASE_ACCOUNT_NOT_FOUND',
      `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`
    );
  }

  return { name: specifiedName, ...credentials };
}

function buildAccountEnv(account, baseEnv = process.env) {
  const env = { ...baseEnv };
  env.BROWSERBASE_API_KEY = account.apiKey;

  setOrDelete(env, 'BROWSERBASE_PROJECT_ID', account.projectId);
  setOrDelete(env, 'BROWSERBASE_CONTEXT_ID', account.contextId);
  setOrDelete(env, 'BROWSERBASE_BASE_URL', account.baseUrl);

  return env;
}

function summarizeAccount(name, account) {
  return {
    name,
    apiKey: redactSecret(account.apiKey),
    projectId: account.projectId || null,
    contextId: account.contextId || null,
    baseUrl: account.baseUrl || null,
  };
}

function setOrDelete(env, key, value) {
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
}

function redactSecret(value) {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return '***';
  }

  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

module.exports = {
  parseAccounts,
  resolveAccount,
  buildAccountEnv,
  summarizeAccount,
};