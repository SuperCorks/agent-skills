/**
 * Transform raw Slack API responses to normalized schema
 */

/**
 * Convert Slack timestamp to ISO 8601
 * @param {string} ts - Slack timestamp (e.g., "1234567890.123456")
 * @returns {string} ISO 8601 timestamp
 */
function tsToISO(ts) {
  const seconds = parseFloat(ts);
  return new Date(seconds * 1000).toISOString();
}

/**
 * Replace user mentions with display names
 * @param {string} text - Message text with <@USERID> mentions
 * @param {Map<string, { name: string, displayName: string }>} userMap
 * @returns {string} Text with mentions replaced
 */
function resolveTextMentions(text, userMap) {
  if (!text) return text;
  
  return text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
    const user = userMap.get(userId);
    return user ? `@${user.displayName}` : match;
  });
}

/**
 * Extract all user IDs mentioned in text
 * @param {string} text - Message text
 * @returns {string[]} Array of user IDs
 */
function extractUserMentions(text) {
  if (!text) return [];
  const matches = text.matchAll(/<@([A-Z0-9]+)>/g);
  return [...matches].map(m => m[1]);
}

/**
 * Normalize a single message
 * 
 * @param {Object} rawMsg - Raw Slack message object
 * @param {Map<string, { name: string, displayName: string }>} userMap - User ID to info map
 * @returns {Object} Normalized message
 */
function normalizeMessage(rawMsg, userMap) {
  const userId = rawMsg.user || rawMsg.bot_id;
  const userInfo = userMap.get(userId) || { name: userId, displayName: userId };

  return {
    ts: rawMsg.ts,
    userId,
    userName: userInfo.name,
    userDisplayName: userInfo.displayName,
    text: rawMsg.text || '',
    textResolved: resolveTextMentions(rawMsg.text, userMap),
    threadTs: rawMsg.thread_ts || null,
    replyCount: rawMsg.reply_count || 0,
    reactions: (rawMsg.reactions || []).map(r => ({
      name: r.name,
      count: r.count,
      users: r.users || [],
    })),
    attachments: (rawMsg.attachments || []).map(a => ({
      fallback: a.fallback,
      title: a.title,
      text: a.text,
      pretext: a.pretext,
      imageUrl: a.image_url,
      thumbUrl: a.thumb_url,
    })),
    files: (rawMsg.files || []).map(f => ({
      id: f.id,
      name: f.name,
      title: f.title,
      mimetype: f.mimetype,
      size: f.size,
      url: f.url_private,
      urlPrivate: f.url_private,
      urlPrivateDownload: f.url_private_download || f.url_private,
      permalink: f.permalink,
    })),
    timestamp: tsToISO(rawMsg.ts),
    isBot: !!rawMsg.bot_id,
    subtype: rawMsg.subtype || null,
  };
}

/**
 * Normalize full output
 * 
 * @param {Object} targetMessage - The target message
 * @param {Object[]} threadReplies - Thread replies (empty if not a thread)
 * @param {Object[]} contextBefore - Messages before target
 * @param {Object[]} contextAfter - Messages after target
 * @param {Object} channelInfo - Channel info object
 * @param {Map<string, { name: string, displayName: string }>} userMap
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Full normalized output
 */
function normalizeOutput(
  targetMessage,
  threadReplies,
  contextBefore,
  contextAfter,
  channelInfo,
  userMap,
  metadata
) {
  const parentTs = targetMessage.thread_ts || (targetMessage.reply_count ? targetMessage.ts : null);
  const threadParent = parentTs
    ? threadReplies.find(message => message.ts === parentTs)
    : null;
  const hasThread = Boolean(parentTs && threadReplies.length > 0);
  
  return {
    metadata: {
      url: metadata.url,
      fetchedAt: new Date().toISOString(),
      workspace: metadata.workspace,
    },
    channel: {
      id: channelInfo.id,
      name: channelInfo.name,
      isPrivate: channelInfo.is_private || false,
      isIm: channelInfo.is_im || false,
      isMpim: channelInfo.is_mpim || false,
      topic: channelInfo.topic?.value || null,
      purpose: channelInfo.purpose?.value || null,
    },
    targetMessage: normalizeMessage(targetMessage, userMap),
    thread: hasThread ? {
      parentTs,
      targetIsReply: targetMessage.ts !== parentTs,
      parent: threadParent ? normalizeMessage(threadParent, userMap) : null,
      replyCount: threadParent?.reply_count || Math.max(0, threadReplies.length - 1),
      replies: threadReplies
        .filter(m => m.ts !== parentTs)
        .map(m => normalizeMessage(m, userMap)),
    } : null,
    context: {
      before: contextBefore.map(m => normalizeMessage(m, userMap)),
      after: contextAfter.map(m => normalizeMessage(m, userMap)),
    },
  };
}

/**
 * Collect all user IDs from messages
 * @param {Object[]} messages - Array of raw messages
 * @returns {string[]} Array of unique user IDs
 */
function collectUserIds(messages) {
  const userIds = new Set();
  
  for (const msg of messages) {
    if (msg.user) userIds.add(msg.user);
    if (msg.bot_id) userIds.add(msg.bot_id);
    
    // Extract mentions from text
    for (const mention of extractUserMentions(msg.text)) {
      userIds.add(mention);
    }
    
    // Extract from reactions
    if (msg.reactions) {
      for (const reaction of msg.reactions) {
        for (const userId of reaction.users || []) {
          userIds.add(userId);
        }
      }
    }
  }
  
  return [...userIds];
}

/**
 * Normalize a conversation returned by conversations.list.
 */
function normalizeConversation(conversation, userMap) {
  const dmUser = conversation.user ? userMap.get(conversation.user) : null;
  const type = conversation.is_im
    ? 'im'
    : conversation.is_mpim
      ? 'mpim'
      : conversation.is_private
        ? 'private_channel'
        : 'public_channel';

  return {
    id: conversation.id,
    type,
    name: conversation.name || dmUser?.displayName || conversation.id,
    userId: conversation.user || null,
    userDisplayName: dmUser?.displayName || null,
    isMember: conversation.is_member ?? null,
    isArchived: conversation.is_archived || false,
    isShared: conversation.is_shared || conversation.is_ext_shared || false,
    created: conversation.created ? new Date(conversation.created * 1000).toISOString() : null,
    topic: conversation.topic?.value || null,
    purpose: conversation.purpose?.value || null,
  };
}

/**
 * Normalize a search.messages match.
 */
function normalizeSearchMatch(match, userMap) {
  const message = normalizeMessage(match, userMap);

  return {
    ...message,
    channel: {
      id: match.channel?.id || null,
      name: match.channel?.name || null,
      isPrivate: match.channel?.is_private || false,
      isIm: match.type === 'im',
      isMpim: match.channel?.is_mpim || false,
    },
    permalink: match.permalink || null,
  };
}

module.exports = {
  normalizeMessage,
  normalizeOutput,
  collectUserIds,
  resolveTextMentions,
  tsToISO,
  normalizeConversation,
  normalizeSearchMatch,
};
