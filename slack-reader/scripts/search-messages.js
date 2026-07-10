#!/usr/bin/env node

const { parseArgs, parseInteger, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { searchMessages, resolveUsers } = require('../lib/client');
const { collectUserIds, normalizeSearchMatch } = require('../lib/normalizer');
const { createSession } = require('../lib/session');

const HELP = `
Search Slack messages visible to a user token.

Usage:
  node scripts/search-messages.js --query <query> [options]

Options:
  --query <query>       Slack search query (required; supports in:, from:, before:, after:)
  --workspace <name>   Workspace alias from SLACK_WORKSPACES
  --count <n>           Results per page, 1-100 (default: 20)
  --page <n>            Page number, 1-100 (default: 1)
  --sort <mode>         score (default) or timestamp
  --sort-dir <dir>      desc (default) or asc
  --help                Show this help message

Requires an xoxp- user token with search:read.
`;

async function main() {
  const args = parseArgs();
  if (args.help) printHelp(HELP);
  if (!args.query) throw new SkillError('SLACK_ARGUMENT_INVALID', '--query is required');

  const count = parseInteger(args.count, { name: '--count', defaultValue: 20, min: 1, max: 100 });
  const page = parseInteger(args.page, { name: '--page', defaultValue: 1, min: 1, max: 100 });
  const sort = args.sort || 'score';
  const sortDir = args.sortDir || 'desc';
  if (!['score', 'timestamp'].includes(sort)) throw new SkillError('SLACK_ARGUMENT_INVALID', '--sort must be score or timestamp');
  if (!['asc', 'desc'].includes(sortDir)) throw new SkillError('SLACK_ARGUMENT_INVALID', '--sort-dir must be asc or desc');

  const { client, workspaceName, token } = createSession({ workspace: args.workspace });
  if (!token.startsWith('xoxp-')) throw new SkillError('SLACK_USER_TOKEN_REQUIRED');

  const result = await searchMessages(client, args.query, { count, page, sort, sortDir });
  const matches = result.messages?.matches || [];
  const userMap = await resolveUsers(client, collectUserIds(matches));

  outputJson({
    metadata: {
      fetchedAt: new Date().toISOString(),
      workspace: workspaceName,
      query: result.query || args.query,
      count: matches.length,
      paging: result.messages?.paging || result.messages?.pagination || null,
    },
    matches: matches.map(match => normalizeSearchMatch(match, userMap)),
  });
}

main().catch(outputError);
