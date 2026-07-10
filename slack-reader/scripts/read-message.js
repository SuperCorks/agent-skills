#!/usr/bin/env node
/**
 * Read a Slack message by permalink URL
 * 
 * Fetches message content, thread replies (if applicable), and channel context.
 */

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseSlackUrl } = require('../lib/url-parser');
const { getMessage, getThreadReplies, getChannelContext, getChannelInfo, resolveUsers } = require('../lib/client');
const { normalizeOutput, collectUserIds } = require('../lib/normalizer');
const { createSession } = require('../lib/session');

const HELP = `
Read a Slack message by permalink URL.

Usage:
  node scripts/read-message.js --url <permalink> [options]

Options:
  --url <url>           Slack message permalink (required)
  --workspace <name>    Workspace alias from SLACK_WORKSPACES (auto-detected if possible)
  --context-size <n>    Number of messages before/after for context (default: 5)
  --help                Show this help message

Environment:
  SLACK_WORKSPACES      JSON object of workspace aliases to tokens (multi-workspace)
                        Example: {"personal": "xoxb-...", "company": "xoxb-..."}
  SLACK_BOT_TOKEN       Fallback for single workspace (xoxb-...)

Required Scopes:
  channels:history      Read messages from public channels
  channels:read         View basic channel info
  groups:history        Read messages from private channels
  groups:read           View basic private channel info
  im:history            Read direct messages
  mpim:history          Read group direct messages
  users:read            View user profiles

Output:
  JSON object containing:
  - metadata: URL, fetch timestamp, workspace
  - channel: Channel info (name, topic, purpose)
  - targetMessage: The requested message with resolved mentions
  - thread: Thread replies if the message is a thread parent
  - context: Messages before and after the target

Examples:
  node scripts/read-message.js --url "https://myworkspace.slack.com/archives/C123/p1234567890123456"
  node scripts/read-message.js --url "https://myworkspace.slack.com/archives/C123/p1234567890123456" --context-size 10
`;

async function main() {
  const args = parseArgs();

  // Show help
  if (args.help) {
    printHelp(HELP);
  }

  // Validate required args
  if (!args.url) {
    throw new SkillError('SLACK_URL_INVALID', 'Missing --url argument');
  }

  // Parse URL first to get workspace domain for auto-detection
  const { workspace: urlWorkspace, channelId, messageTs, threadTs } = parseSlackUrl(args.url);

  const { client, workspaceName } = createSession({ workspace: args.workspace, urlWorkspace });

  // Parse context size
  const contextSize = parseInteger(args.contextSize, {
    name: '--context-size',
    defaultValue: 5,
    min: 0,
    max: 100,
  });

  // Fetch target message
  const targetMessage = await getMessage(client, channelId, messageTs, threadTs);

  // Fetch the complete thread when the URL points into one or the target has replies.
  let threadReplies = [];
  const resolvedThreadTs = threadTs || targetMessage.thread_ts || (targetMessage.reply_count ? targetMessage.ts : null);
  if (resolvedThreadTs) {
    threadReplies = await getThreadReplies(client, channelId, resolvedThreadTs);
  }

  // Thread replies are not in channel history, so anchor context to the parent.
  const { before, after } = contextSize === 0
    ? { before: [], after: [] }
    : await getChannelContext(client, channelId, resolvedThreadTs || messageTs, contextSize);

  // Get channel info
  const channelInfo = await getChannelInfo(client, channelId);

  // Collect all user IDs from all messages
  const allMessages = [targetMessage, ...threadReplies, ...before, ...after];
  const userIds = collectUserIds(allMessages);

  // Resolve user IDs to profiles
  const userMap = await resolveUsers(client, userIds);

  // Normalize and output
  const output = normalizeOutput(
    targetMessage,
    threadReplies,
    before,
    after,
    channelInfo,
    userMap,
    { url: args.url, workspace: workspaceName, urlWorkspace }
  );

  outputJson(output);
}

main().catch(outputError);
