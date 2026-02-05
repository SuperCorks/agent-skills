/**
 * Slack API wrapper using @slack/web-api WebClient
 */

const { SkillError } = require('./errors');

/**
 * Create a Slack WebClient instance
 * 
 * @param {typeof import('@slack/web-api').WebClient} WebClient - WebClient class
 * @param {string} token - Slack Bot User OAuth Token
 * @returns {import('@slack/web-api').WebClient}
 */
function createClient(WebClient, token) {
  return new WebClient(token);
}

/**
 * Handle Slack API errors and convert to SkillError
 * 
 * @param {Error} err - Error from Slack API
 * @throws {SkillError}
 */
function handleSlackError(err) {
  const errorCode = err.data?.error || err.code;
  
  switch (errorCode) {
    case 'invalid_auth':
    case 'token_revoked':
    case 'token_expired':
    case 'not_authed':
      throw new SkillError('SLACK_AUTH_INVALID', errorCode);
    
    case 'channel_not_found':
      throw new SkillError('SLACK_CHANNEL_NOT_FOUND');
    
    case 'message_not_found':
      throw new SkillError('SLACK_MESSAGE_NOT_FOUND');
    
    case 'missing_scope':
    case 'not_in_channel':
      throw new SkillError('SLACK_PERMISSION_DENIED', errorCode);
    
    case 'ratelimited':
      throw new SkillError('SLACK_RATE_LIMITED');
    
    default:
      throw new SkillError('SLACK_API_ERROR', err.message || errorCode);
  }
}

/**
 * Get a single message by channel and timestamp
 * 
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} channel - Channel ID
 * @param {string} ts - Message timestamp
 * @returns {Promise<Object>} The message object
 * @throws {SkillError}
 */
async function getMessage(client, channel, ts) {
  try {
    const result = await client.conversations.history({
      channel,
      oldest: ts,
      inclusive: true,
      limit: 1,
    });

    if (!result.messages || result.messages.length === 0) {
      throw new SkillError('SLACK_MESSAGE_NOT_FOUND');
    }

    return result.messages[0];
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleSlackError(err);
  }
}

/**
 * Get all replies in a thread
 * 
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} channel - Channel ID
 * @param {string} threadTs - Thread parent timestamp
 * @returns {Promise<Object[]>} Array of message objects
 * @throws {SkillError}
 */
async function getThreadReplies(client, channel, threadTs) {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
    });

    // First message is the parent, rest are replies
    return result.messages || [];
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleSlackError(err);
  }
}

/**
 * Get messages around a specific timestamp for context
 * 
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} channel - Channel ID
 * @param {string} aroundTs - Target message timestamp
 * @param {number} count - Number of messages before and after
 * @returns {Promise<{ before: Object[], after: Object[] }>}
 * @throws {SkillError}
 */
async function getChannelContext(client, channel, aroundTs, count) {
  try {
    // Get messages before (older)
    const beforeResult = await client.conversations.history({
      channel,
      latest: aroundTs,
      inclusive: false,
      limit: count,
    });

    // Get messages after (newer)
    const afterResult = await client.conversations.history({
      channel,
      oldest: aroundTs,
      inclusive: false,
      limit: count,
    });

    return {
      before: (beforeResult.messages || []).reverse(), // Oldest first
      after: (afterResult.messages || []).reverse(), // Oldest first (chronological)
    };
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleSlackError(err);
  }
}

/**
 * Get channel information
 * 
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} channel - Channel ID
 * @returns {Promise<Object>} Channel object
 * @throws {SkillError}
 */
async function getChannelInfo(client, channel) {
  try {
    const result = await client.conversations.info({
      channel,
    });

    return result.channel;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleSlackError(err);
  }
}

/**
 * Resolve user IDs to user info
 * 
 * @param {import('@slack/web-api').WebClient} client
 * @param {string[]} userIds - Array of user IDs
 * @returns {Promise<Map<string, { name: string, displayName: string }>>}
 * @throws {SkillError}
 */
async function resolveUsers(client, userIds) {
  const userMap = new Map();
  
  // Deduplicate user IDs
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  
  // Batch requests (Slack doesn't have a bulk user lookup, so we fetch individually)
  // but we do it concurrently for efficiency
  const batchSize = 10;
  
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    
    const results = await Promise.allSettled(
      batch.map(async (userId) => {
        try {
          const result = await client.users.info({ user: userId });
          return {
            userId,
            name: result.user?.name || userId,
            displayName: result.user?.profile?.display_name || result.user?.real_name || result.user?.name || userId,
          };
        } catch {
          return { userId, name: userId, displayName: userId };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        userMap.set(result.value.userId, {
          name: result.value.name,
          displayName: result.value.displayName,
        });
      }
    }
  }

  return userMap;
}

module.exports = {
  createClient,
  getMessage,
  getThreadReplies,
  getChannelContext,
  getChannelInfo,
  resolveUsers,
};
