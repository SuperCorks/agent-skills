'use strict';

const { SkillError } = require('./errors');

function parseAccounts(value) {
  if (!value || !value.trim()) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new SkillError('ASANA_AUTH_INVALID', `ASANA_ACCOUNTS is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SkillError('ASANA_AUTH_INVALID', 'ASANA_ACCOUNTS must be a JSON object');
  }
  const accounts = new Map();
  for (const [name, token] of Object.entries(parsed)) {
    if (!name.trim() || typeof token !== 'string' || !token.trim()) {
      throw new SkillError('ASANA_AUTH_INVALID', `Invalid entry for account alias "${name}"`);
    }
    accounts.set(name, token.trim());
  }
  return accounts;
}

function resolveAccount(accounts, requested) {
  if (accounts.size === 0) throw new SkillError('ASANA_AUTH_MISSING');
  if (requested) {
    if (!accounts.has(requested)) {
      throw new SkillError('ASANA_ACCOUNT_NOT_FOUND', `Available aliases: ${[...accounts.keys()].join(', ')}`);
    }
    return { name: requested, token: accounts.get(requested) };
  }
  if (accounts.size > 1) {
    throw new SkillError('ASANA_ACCOUNT_AMBIGUOUS', `Available aliases: ${[...accounts.keys()].join(', ')}`);
  }
  const [name, token] = accounts.entries().next().value;
  return { name, token };
}

module.exports = { parseAccounts, resolveAccount };
