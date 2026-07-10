#!/usr/bin/env node

const { parseArgs, parseInteger, parseTimestamp, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseSlackUrl } = require('../lib/url-parser');
const { getConversationHistory, getChannelInfo, resolveUsers } = require('../lib/client');
const { normalizeMessage, collectUserIds } = require('../lib/normalizer');
const { createSession } = require('../lib/session');

const HELP = `
Read recent message history from a Slack conversation.

Usage:
  node scripts/conversation-history.js (--channel <id> | --url <permalink>) [options]

Options:
  --channel <id>       Conversation ID (C..., G..., D...)
  --url <permalink>    Any message permalink in the conversation
  --workspace <name>   Workspace alias from SLACK_WORKSPACES
  --limit <n>          Maximum messages to return (default: 100)
  --oldest <time>      Slack timestamp or ISO 8601 lower bound
  --latest <time>      Slack timestamp or ISO 8601 upper bound
  --inclusive          Include messages exactly on the time bounds
  --order <direction>  desc (newest first, default) or asc
  --help               Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) printHelp(HELP);
  if (!args.channel && !args.url) {
    throw new SkillError('SLACK_URL_INVALID', 'Provide --channel or --url');
  }

  const parsedUrl = args.url ? parseSlackUrl(args.url) : null;
  const channelId = args.channel || parsedUrl.channelId;
  const order = args.order || 'desc';
  if (!['asc', 'desc'].includes(order)) throw new SkillError('SLACK_ARGUMENT_INVALID', '--order must be asc or desc');

  const limit = parseInteger(args.limit, { name: '--limit', defaultValue: 100, min: 1, max: 1000 });
  const oldest = parseTimestamp(args.oldest, '--oldest');
  const latest = parseTimestamp(args.latest, '--latest');
  const { client, workspaceName } = createSession({
    workspace: args.workspace,
    urlWorkspace: parsedUrl?.workspace,
  });

  const [{ messages, nextCursor }, channel] = await Promise.all([
    getConversationHistory(client, channelId, {
      limit,
      oldest,
      latest,
      inclusive: Boolean(args.inclusive),
    }),
    getChannelInfo(client, channelId),
  ]);
  const userMap = await resolveUsers(client, collectUserIds(messages));
  const orderedMessages = order === 'asc' ? [...messages].reverse() : messages;

  outputJson({
    metadata: {
      fetchedAt: new Date().toISOString(),
      workspace: workspaceName,
      count: messages.length,
      nextCursor,
      order,
    },
    channel: {
      id: channel.id,
      name: channel.name || null,
      isPrivate: channel.is_private || false,
      isIm: channel.is_im || false,
      isMpim: channel.is_mpim || false,
    },
    messages: orderedMessages.map(message => normalizeMessage(message, userMap)),
  });
}

main().catch(outputError);
