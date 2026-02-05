/**
 * Parse Slack message permalinks
 * 
 * Format: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP
 * 
 * The timestamp in Slack URLs has a 'p' prefix and no decimal.
 * It needs to be converted to Slack's message_ts format:
 * p1234567890123456 → 1234567890.123456
 */

const { SkillError } = require('./errors');

/**
 * Parse a Slack message permalink URL
 * 
 * @param {string} url - Slack message permalink
 * @returns {{ workspace: string, channelId: string, messageTs: string }}
 * @throws {SkillError} If the URL format is invalid
 */
function parseSlackUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new SkillError('SLACK_URL_INVALID', 'URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SkillError('SLACK_URL_INVALID', 'Not a valid URL');
  }

  // Extract workspace from hostname (e.g., "myworkspace" from "myworkspace.slack.com")
  const hostParts = parsed.hostname.split('.');
  if (hostParts.length < 2 || !hostParts.includes('slack')) {
    throw new SkillError('SLACK_URL_INVALID', 'Not a Slack URL');
  }
  const workspace = hostParts[0];

  // Parse path: /archives/CHANNEL_ID/pTIMESTAMP or /archives/CHANNEL_ID/pTIMESTAMP?thread_ts=...
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  
  if (pathParts.length < 3 || pathParts[0] !== 'archives') {
    throw new SkillError('SLACK_URL_INVALID', 'Expected /archives/CHANNEL_ID/pTIMESTAMP format');
  }

  const channelId = pathParts[1];
  const tsWithPrefix = pathParts[2];

  // Validate channel ID format (starts with C, D, G, or W)
  if (!/^[CDGW][A-Z0-9]+$/.test(channelId)) {
    throw new SkillError('SLACK_URL_INVALID', `Invalid channel ID format: ${channelId}`);
  }

  // Parse timestamp: strip 'p' prefix and insert decimal
  // p1234567890123456 → 1234567890.123456
  if (!tsWithPrefix.startsWith('p')) {
    throw new SkillError('SLACK_URL_INVALID', 'Timestamp should start with "p"');
  }

  const tsDigits = tsWithPrefix.slice(1); // Remove 'p' prefix
  
  if (!/^\d{16}$/.test(tsDigits)) {
    throw new SkillError('SLACK_URL_INVALID', `Invalid timestamp format: ${tsWithPrefix}`);
  }

  // Insert decimal after the 10th digit (seconds.microseconds)
  const messageTs = `${tsDigits.slice(0, 10)}.${tsDigits.slice(10)}`;

  return {
    workspace,
    channelId,
    messageTs,
  };
}

module.exports = {
  parseSlackUrl,
};
