/**
 * Multi-account management for Asana
 * 
 * ASANA_ACCOUNTS format: JSON object {"personal": "0/xxx", "work": "0/yyy"}
 */

const { SkillError } = require('./errors');

/**
 * Parse ASANA_ACCOUNTS environment variable
 * 
 * @param {string} envValue - JSON string of account tokens
 * @returns {Map<string, string>} Map of account name to token
 * @throws {SkillError} If JSON is invalid
 */
function parseAccounts(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  try {
    const parsed = JSON.parse(envValue);
    
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillError('ASANA_AUTH_INVALID', 'ASANA_ACCOUNTS must be a JSON object');
    }

    const accounts = new Map();
    for (const [name, token] of Object.entries(parsed)) {
      if (typeof token !== 'string' || !token.trim()) {
        throw new SkillError('ASANA_AUTH_INVALID', `Invalid token for account "${name}"`);
      }
      accounts.set(name, token.trim());
    }

    return accounts;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    throw new SkillError('ASANA_AUTH_INVALID', `Invalid JSON in ASANA_ACCOUNTS: ${err.message}`);
  }
}

/**
 * Resolve which account to use
 * 
 * @param {Map<string, string>} accounts - Parsed accounts map
 * @param {string} [specifiedName] - Account name from --account flag
 * @returns {{ name: string, token: string }} Resolved account
 * @throws {SkillError} If account cannot be resolved
 */
function resolveAccount(accounts, specifiedName) {
  const accountCount = accounts.size;

  // No accounts configured
  if (accountCount === 0) {
    throw new SkillError('ASANA_AUTH_MISSING');
  }

  // One account - use it regardless of specifiedName
  if (accountCount === 1) {
    const [name, token] = [...accounts.entries()][0];
    return { name, token };
  }

  // Multiple accounts - need specifiedName
  if (!specifiedName) {
    const names = [...accounts.keys()].join(', ');
    throw new SkillError('ASANA_ACCOUNT_AMBIGUOUS', `Available accounts: ${names}`);
  }

  // Look up specified account
  const token = accounts.get(specifiedName);
  if (!token) {
    const names = [...accounts.keys()].join(', ');
    throw new SkillError('ASANA_ACCOUNT_NOT_FOUND', `"${specifiedName}" not in [${names}]`);
  }

  return { name: specifiedName, token };
}

module.exports = {
  parseAccounts,
  resolveAccount,
};
