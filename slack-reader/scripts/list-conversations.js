#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { listConversations, resolveUsers } = require('../lib/client');
const { normalizeConversation } = require('../lib/normalizer');
const { createSession } = require('../lib/session');

const HELP = `
List Slack conversations visible to the configured token.

Usage:
  node scripts/list-conversations.js [options]

Options:
  --workspace <name>   Workspace alias from SLACK_WORKSPACES
  --types <types>      Comma-separated public_channel,private_channel,mpim,im
                       (default: all four)
  --limit <n>          Maximum conversations to return (default: 100)
  --cursor <cursor>    Resume from a Slack pagination cursor
  --include-archived   Include archived conversations
  --help               Show this help message
`;

async function main() {
  const args = parseArgs();
  if (args.help) printHelp(HELP);

  const types = args.types || 'public_channel,private_channel,mpim,im';
  const validTypes = new Set(['public_channel', 'private_channel', 'mpim', 'im']);
  if (types.split(',').some(type => !validTypes.has(type))) {
    throw new SkillError('SLACK_ARGUMENT_INVALID', '--types contains an unsupported conversation type');
  }

  const limit = parseInteger(args.limit, { name: '--limit', defaultValue: 100, min: 1, max: 1000 });
  const { client, workspaceName } = createSession({ workspace: args.workspace });
  const { conversations, nextCursor } = await listConversations(client, {
    types,
    excludeArchived: !args.includeArchived,
    limit,
    cursor: args.cursor,
  });

  const dmUserIds = conversations.map(conversation => conversation.user).filter(Boolean);
  const userMap = await resolveUsers(client, dmUserIds);

  outputJson({
    metadata: {
      fetchedAt: new Date().toISOString(),
      workspace: workspaceName,
      types: types.split(','),
      count: conversations.length,
      nextCursor,
    },
    conversations: conversations.map(conversation => normalizeConversation(conversation, userMap)),
  });
}

main().catch(outputError);
