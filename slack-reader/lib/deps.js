/**
 * Dependency management for Slack Reader skill
 */

const { SkillError } = require('./errors');

/**
 * Check and require the @slack/web-api SDK
 * @returns {typeof import('@slack/web-api').WebClient} WebClient class
 * @throws {SkillError} If the SDK is not installed
 */
function requireSlackSDK() {
  try {
    const { WebClient } = require('@slack/web-api');
    return WebClient;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new SkillError('SLACK_SDK_MISSING');
    }
    throw err;
  }
}

module.exports = {
  requireSlackSDK,
};
