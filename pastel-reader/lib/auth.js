const fs = require('fs');
const os = require('os');
const path = require('path');
const { SkillError } = require('./errors');

const START_MARKER = '# >>> pastel-reader auth >>>';
const END_MARKER = '# <<< pastel-reader auth <<<';
const MANAGED_COMMENT = '# Managed by agent-skills pastel-reader. Edit with scripts/auth.js.';

function getApiToken(options = {}) {
  return resolveAuth(options).apiToken;
}

function resolveAuth(options = {}) {
  const env = options.env || process.env;
  const config = loadAuthConfig({ env, zshrcPath: options.zshrcPath });
  const requestedName = normalizeString(options.account) || normalizeString(env.PASTEL_ACCOUNT) || config.defaultAccount;
  const account = resolveAccount(config.accounts, requestedName);

  return {
    ...account,
    source: config.source,
    zshrcPath: config.zshrcPath,
  };
}

function loadAuthConfig(options = {}) {
  const env = options.env || process.env;
  const zshrcPath = options.zshrcPath || defaultZshrcPath(env);
  const zshrcConfig = readZshrcConfig(zshrcPath);
  const envAccounts = parseAccounts(env.PASTEL_ACCOUNTS, 'PASTEL_ACCOUNTS');
  let accounts = envAccounts;
  let defaultAccount = normalizeString(env.PASTEL_ACCOUNT);
  let source = envAccounts.size ? 'environment' : null;

  if (accounts.size === 0 && zshrcConfig.accounts.size > 0) {
    accounts = zshrcConfig.accounts;
    defaultAccount = defaultAccount || zshrcConfig.defaultAccount;
    source = 'zshrc';
  } else if (!defaultAccount && zshrcConfig.defaultAccount && accounts.has(zshrcConfig.defaultAccount)) {
    defaultAccount = zshrcConfig.defaultAccount;
  }

  const fallbackToken = normalizeString(env.PASTEL_API_TOKEN);
  if (accounts.size === 0 && fallbackToken) {
    accounts = new Map([['default', { apiToken: fallbackToken }]]);
    defaultAccount = 'default';
    source = 'PASTEL_API_TOKEN';
  }

  return {
    accounts,
    defaultAccount,
    source: source || 'none',
    zshrcPath,
    blockFound: zshrcConfig.blockFound,
  };
}

function summarizeAuthConfig(options = {}) {
  const config = loadAuthConfig(options);
  const accounts = [...config.accounts.entries()].map(([name, account]) => summarizeAccount(name, account));

  return {
    configured: accounts.length,
    accounts,
    defaultAccount: config.defaultAccount || (accounts.length === 1 ? accounts[0].name : null),
    source: config.source,
    zshrcPath: config.zshrcPath,
    zshrcBlockFound: config.blockFound,
  };
}

function parseAccounts(envValue, variableName = 'PASTEL_ACCOUNTS') {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(envValue);
  } catch (error) {
    throw new SkillError('PASTEL_AUTH_INVALID', `Invalid JSON in ${variableName}: ${error.message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkillError('PASTEL_AUTH_INVALID', `${variableName} must be a JSON object`);
  }

  const accounts = new Map();
  for (const [name, value] of Object.entries(parsed)) {
    validateAccountAlias(name);
    accounts.set(name, normalizeAccountValue(name, value));
  }

  return accounts;
}

function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('PASTEL_AUTH_MISSING');
  }

  if (accounts.size === 1 && !specifiedName) {
    const [name, credentials] = [...accounts.entries()][0];
    return { name, ...credentials };
  }

  if (!specifiedName) {
    throw new SkillError('PASTEL_ACCOUNT_AMBIGUOUS', `Available accounts: ${[...accounts.keys()].join(', ')}`);
  }

  validateAccountAlias(specifiedName);
  const credentials = accounts.get(specifiedName);
  if (!credentials) {
    throw new SkillError('PASTEL_ACCOUNT_NOT_FOUND', `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`);
  }

  return { name: specifiedName, ...credentials };
}

function upsertZshrcAccount(options) {
  const name = requireAccountName(options.account);
  const token = requireApiToken(options.token);
  const config = loadEditableZshrcConfig(options);
  const accounts = new Map(config.accounts);

  accounts.set(name, { apiToken: token });
  const defaultAccount = options.makeDefault || !config.defaultAccount ? name : config.defaultAccount;
  return writeZshrcConfig({ accounts, defaultAccount, zshrcPath: config.zshrcPath });
}

function replaceZshrcAccount(options) {
  const name = requireAccountName(options.account);
  const token = requireApiToken(options.token);
  const config = loadEditableZshrcConfig(options);
  const accounts = new Map(config.accounts);

  if (!accounts.has(name)) {
    throw new SkillError('PASTEL_ACCOUNT_NOT_FOUND', `"${name}" not in [${[...accounts.keys()].join(', ')}]`);
  }

  accounts.set(name, { apiToken: token });
  const defaultAccount = options.makeDefault || !config.defaultAccount ? name : config.defaultAccount;
  return writeZshrcConfig({ accounts, defaultAccount, zshrcPath: config.zshrcPath });
}

function removeZshrcAccount(options) {
  const name = requireAccountName(options.account);
  const config = loadEditableZshrcConfig(options);
  const accounts = new Map(config.accounts);

  if (!accounts.delete(name)) {
    throw new SkillError('PASTEL_ACCOUNT_NOT_FOUND', `"${name}" not in [${[...accounts.keys()].join(', ')}]`);
  }

  let defaultAccount = config.defaultAccount;
  if (defaultAccount === name) {
    defaultAccount = accounts.size === 1 ? [...accounts.keys()][0] : null;
  }

  return writeZshrcConfig({ accounts, defaultAccount, zshrcPath: config.zshrcPath });
}

function setDefaultZshrcAccount(options) {
  const name = requireAccountName(options.account);
  const config = loadEditableZshrcConfig(options);

  if (!config.accounts.has(name)) {
    throw new SkillError('PASTEL_ACCOUNT_NOT_FOUND', `"${name}" not in [${[...config.accounts.keys()].join(', ')}]`);
  }

  return writeZshrcConfig({
    accounts: config.accounts,
    defaultAccount: name,
    zshrcPath: config.zshrcPath,
  });
}

function loadEditableZshrcConfig(options = {}) {
  const env = options.env || process.env;
  const zshrcPath = options.zshrcPath || defaultZshrcPath(env);
  const zshrcConfig = readZshrcConfig(zshrcPath);
  if (zshrcConfig.blockFound) {
    return zshrcConfig;
  }

  const envConfig = loadAuthConfig({ env, zshrcPath });
  if (envConfig.source === 'PASTEL_API_TOKEN') {
    return { accounts: new Map(), defaultAccount: null, zshrcPath, blockFound: false };
  }

  return {
    accounts: new Map(envConfig.accounts),
    defaultAccount: envConfig.defaultAccount,
    zshrcPath,
    blockFound: false,
  };
}

function readZshrcConfig(zshrcPath = defaultZshrcPath()) {
  const result = {
    accounts: new Map(),
    defaultAccount: null,
    zshrcPath,
    blockFound: false,
  };

  if (!fs.existsSync(zshrcPath)) {
    return result;
  }

  const text = fs.readFileSync(zshrcPath, 'utf8');
  const block = extractManagedBlock(text);
  if (!block) {
    return result;
  }

  result.blockFound = true;
  const accountsValue = extractExportValue(block, 'PASTEL_ACCOUNTS');
  const defaultValue = extractExportValue(block, 'PASTEL_ACCOUNT');
  result.accounts = parseAccounts(accountsValue || '', 'PASTEL_ACCOUNTS');
  result.defaultAccount = normalizeString(defaultValue);
  return result;
}

function writeZshrcConfig({ accounts, defaultAccount, zshrcPath = defaultZshrcPath() }) {
  const block = accounts.size ? buildManagedBlock(accounts, defaultAccount) : '';
  const existing = fs.existsSync(zshrcPath) ? fs.readFileSync(zshrcPath, 'utf8') : '';
  const next = replaceManagedBlock(existing, block);

  fs.mkdirSync(path.dirname(zshrcPath), { recursive: true });
  fs.writeFileSync(zshrcPath, next, { mode: 0o600 });

  return {
    zshrcPath,
    configured: accounts.size,
    accounts: [...accounts.entries()].map(([name, account]) => summarizeAccount(name, account)),
    defaultAccount: defaultAccount || (accounts.size === 1 ? [...accounts.keys()][0] : null),
  };
}

function buildManagedBlock(accounts, defaultAccount) {
  const serialized = JSON.stringify(serializeAccounts(accounts));
  const lines = [
    START_MARKER,
    MANAGED_COMMENT,
    `export PASTEL_ACCOUNTS=${shellQuote(serialized)}`,
  ];

  if (defaultAccount) {
    lines.push(`export PASTEL_ACCOUNT=${shellQuote(defaultAccount)}`);
  }

  lines.push(END_MARKER);
  return lines.join('\n');
}

function replaceManagedBlock(text, block) {
  const pattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\n?`);
  if (pattern.test(text)) {
    return text.replace(pattern, block ? `${block}\n` : '');
  }

  if (!block) {
    return text;
  }

  const prefix = text.trimEnd();
  return `${prefix}${prefix ? '\n\n' : ''}${block}\n`;
}

function extractManagedBlock(text) {
  const pattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`);
  const match = text.match(pattern);
  return match ? match[0] : null;
}

function extractExportValue(block, name) {
  const match = block.match(new RegExp(`(?:^|\\n)export\\s+${escapeRegExp(name)}=(.+?)(?:\\n|$)`));
  if (!match) {
    return null;
  }

  return unquoteShellValue(match[1].trim());
}

function serializeAccounts(accounts) {
  const result = {};
  for (const [name, account] of accounts.entries()) {
    if (account.baseUrl) {
      result[name] = { apiToken: account.apiToken, baseUrl: account.baseUrl };
    } else {
      result[name] = account.apiToken;
    }
  }
  return result;
}

function normalizeAccountValue(name, value) {
  if (typeof value === 'string') {
    const apiToken = normalizeString(value);
    if (!apiToken) {
      throw new SkillError('PASTEL_AUTH_INVALID', `Account "${name}" has an empty token`);
    }
    return { apiToken };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SkillError('PASTEL_AUTH_INVALID', `Account "${name}" must be a token string or credential object`);
  }

  const apiToken = normalizeString(value.apiToken || value.token || value.apiKey || value.key);
  const baseUrl = normalizeString(value.baseUrl || value.apiBaseUrl || value.apiUrl);
  if (!apiToken) {
    throw new SkillError('PASTEL_AUTH_INVALID', `Account "${name}" must include apiToken/token`);
  }

  return { apiToken, baseUrl };
}

function summarizeAccount(name, account) {
  return {
    name,
    token: redactSecret(account.apiToken),
    baseUrl: account.baseUrl || null,
  };
}

function validateAccountAlias(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(name || ''))) {
    throw new SkillError('PASTEL_ACCOUNT_INVALID', `Invalid account alias: ${name}`);
  }
}

function requireAccountName(value) {
  const name = normalizeString(value);
  if (!name) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Provide --account <alias>');
  }
  validateAccountAlias(name);
  return name;
}

function requireApiToken(value) {
  const token = normalizeString(value);
  if (!token) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Provide --token <api-token>');
  }
  if (token.includes('\n') || token.includes('\r')) {
    throw new SkillError('PASTEL_ARGS_INVALID', 'Token must be a single line');
  }
  return token;
}

function defaultZshrcPath(env = process.env) {
  return normalizeString(env.PASTEL_ZSHRC_PATH) || path.join(os.homedir(), '.zshrc');
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function redactSecret(value) {
  if (!value) {
    return null;
  }
  if (value.length <= 10) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function unquoteShellValue(raw) {
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return raw;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  START_MARKER,
  END_MARKER,
  getApiToken,
  resolveAuth,
  loadAuthConfig,
  summarizeAuthConfig,
  parseAccounts,
  resolveAccount,
  upsertZshrcAccount,
  replaceZshrcAccount,
  removeZshrcAccount,
  setDefaultZshrcAccount,
  readZshrcConfig,
  writeZshrcConfig,
};
