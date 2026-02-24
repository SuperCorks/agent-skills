const { SkillError } = require('./errors');

/**
 * Parse ITERABLE_ACCOUNTS env var JSON map.
 *
 * @param {string} envValue
 * @returns {Map<string, string>}
 */
function parseAccounts(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  try {
    const parsed = JSON.parse(envValue);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillError('ITERABLE_AUTH_INVALID', 'ITERABLE_ACCOUNTS must be a JSON object');
    }

    const accounts = new Map();
    for (const [name, apiKey] of Object.entries(parsed)) {
      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        throw new SkillError('ITERABLE_AUTH_INVALID', `Invalid API key for account "${name}"`);
      }
      accounts.set(name, apiKey.trim());
    }

    return accounts;
  } catch (error) {
    if (error instanceof SkillError) {
      throw error;
    }
    throw new SkillError('ITERABLE_AUTH_INVALID', `Invalid JSON in ITERABLE_ACCOUNTS: ${error.message}`);
  }
}

/**
 * Resolve selected account.
 *
 * @param {Map<string, string>} accounts
 * @param {string | undefined} specifiedName
 * @returns {{ name: string, apiKey: string }}
 */
function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('ITERABLE_AUTH_MISSING');
  }

  if (accounts.size === 1) {
    const [name, apiKey] = [...accounts.entries()][0];
    return { name, apiKey };
  }

  if (!specifiedName) {
    throw new SkillError('ITERABLE_ACCOUNT_AMBIGUOUS', `Available accounts: ${[...accounts.keys()].join(', ')}`);
  }

  const apiKey = accounts.get(specifiedName);
  if (!apiKey) {
    throw new SkillError('ITERABLE_ACCOUNT_NOT_FOUND', `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`);
  }

  return { name: specifiedName, apiKey };
}

module.exports = {
  parseAccounts,
  resolveAccount,
};
