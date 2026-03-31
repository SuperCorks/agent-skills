const { SkillError } = require('./errors');

function parseAccounts(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  try {
    const parsed = JSON.parse(envValue);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillError('GODADDY_AUTH_INVALID', 'GODADDY_ACCOUNTS must be a JSON object');
    }

    const accounts = new Map();
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SkillError(
          'GODADDY_AUTH_INVALID',
          `Account "${name}" must be an object with key and secret fields`
        );
      }

      const key = normalizeString(value.key || value.apiKey);
      const secret = normalizeString(value.secret || value.apiSecret);
      const baseUrl = normalizeString(value.baseUrl);

      if (!key || !secret) {
        throw new SkillError(
          'GODADDY_AUTH_INVALID',
          `Account "${name}" must include key/apiKey and secret/apiSecret`
        );
      }

      accounts.set(name, { key, secret, baseUrl });
    }

    return accounts;
  } catch (error) {
    if (error instanceof SkillError) {
      throw error;
    }

    throw new SkillError('GODADDY_AUTH_INVALID', `Invalid JSON in GODADDY_ACCOUNTS: ${error.message}`);
  }
}

function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('GODADDY_AUTH_MISSING');
  }

  if (accounts.size === 1) {
    const [name, credentials] = [...accounts.entries()][0];
    return { name, ...credentials };
  }

  if (!specifiedName) {
    throw new SkillError('GODADDY_ACCOUNT_AMBIGUOUS', `Available accounts: ${[...accounts.keys()].join(', ')}`);
  }

  const credentials = accounts.get(specifiedName);
  if (!credentials) {
    throw new SkillError(
      'GODADDY_ACCOUNT_NOT_FOUND',
      `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`
    );
  }

  return { name: specifiedName, ...credentials };
}

function inferBaseUrl(accountName, providedBaseUrl) {
  if (providedBaseUrl) {
    return providedBaseUrl.replace(/\/$/, '');
  }

  if (/^(ote|sandbox|test)/i.test(accountName)) {
    return 'https://api.ote-godaddy.com';
  }

  return 'https://api.godaddy.com';
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
  inferBaseUrl,
};
