const { SkillError } = require('./errors');

function parseAccounts(envValue) {
  if (!envValue || envValue.trim() === '') {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(envValue);
  } catch (error) {
    throw new SkillError('VIMEO_OTT_AUTH_INVALID', `Invalid JSON in VIMEO_OTT_ACCOUNTS: ${error.message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SkillError('VIMEO_OTT_AUTH_INVALID', 'VIMEO_OTT_ACCOUNTS must be a JSON object');
  }

  const accounts = new Map();
  for (const [name, apiKey] of Object.entries(parsed)) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new SkillError('VIMEO_OTT_AUTH_INVALID', `Invalid API key for account "${name}"`);
    }
    accounts.set(name, apiKey.trim());
  }

  return accounts;
}

function resolveAccount(accounts, specifiedName) {
  if (accounts.size === 0) {
    throw new SkillError('VIMEO_OTT_AUTH_MISSING');
  }

  if (accounts.size === 1 && !specifiedName) {
    const [name, apiKey] = [...accounts.entries()][0];
    return { name, apiKey };
  }

  if (!specifiedName) {
    throw new SkillError('VIMEO_OTT_ACCOUNT_AMBIGUOUS', `Available accounts: ${[...accounts.keys()].join(', ')}`);
  }

  const apiKey = accounts.get(specifiedName);
  if (!apiKey) {
    throw new SkillError('VIMEO_OTT_ACCOUNT_NOT_FOUND', `"${specifiedName}" not in [${[...accounts.keys()].join(', ')}]`);
  }

  return { name: specifiedName, apiKey };
}

module.exports = {
  parseAccounts,
  resolveAccount,
};