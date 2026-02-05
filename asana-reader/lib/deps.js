/**
 * Dependency management for Asana Reader skill
 */

const { SkillError } = require('./errors');

/**
 * Check and require the asana SDK
 * @returns {typeof import('asana')} Asana module
 * @throws {SkillError} If the SDK is not installed
 */
function requireAsanaSDK() {
  try {
    const asana = require('asana');
    return asana;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new SkillError('ASANA_SDK_MISSING');
    }
    throw err;
  }
}

module.exports = {
  requireAsanaSDK,
};
