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
      validateAccountName(name);
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

  const session = normalizeString(env.BROWSE_SESSION) || 'browserbase-default';
  validateSessionName(session, 'BROWSE_SESSION');

  return new Map([
    ['default', {
      apiKey,
      projectId: normalizeString(env.BROWSERBASE_PROJECT_ID),
      contextId: normalizeString(env.BROWSERBASE_CONTEXT_ID),
      baseUrl: normalizeString(env.BROWSERBASE_BASE_URL),
      session,
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
  const session = normalizeString(value.session || value.sessionName);

  if (!apiKey) {
    throw new SkillError('BROWSERBASE_AUTH_INVALID', `Account "${name}" must include apiKey`);
  }

  if (session) {
    validateSessionName(session, `Account "${name}" session`);
  }

  return { apiKey, projectId, contextId, baseUrl, session };
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
  env.BROWSE_SESSION = account.session || `browserbase-${account.name}`;
  env.BROWSE_LOAD_DOTENV = '0';

  setOrDelete(env, 'BROWSERBASE_PROJECT_ID', account.projectId);
  setOrDelete(env, 'BROWSERBASE_CONTEXT_ID', account.contextId);
  setOrDelete(env, 'BROWSERBASE_BASE_URL', account.baseUrl);
  delete env.BROWSERBASE_API_BASE_URL;

  return env;
}

function summarizeAccount(name, account) {
  return {
    name,
    apiKey: account.apiKey ? '[configured]' : null,
    projectId: account.projectId || null,
    contextId: account.contextId ? '[configured]' : null,
    baseUrl: account.baseUrl || null,
    session: account.session || `browserbase-${name}`,
  };
}

function setOrDelete(env, key, value) {
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
}

function validateAccountName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new SkillError(
      'BROWSERBASE_AUTH_INVALID',
      `Account alias "${name}" must start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens`
    );
  }
}

function validateSessionName(name, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new SkillError(
      'BROWSERBASE_AUTH_INVALID',
      `${label} must start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens`
    );
  }
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
  validateAccountName,
  validateSessionName,
};