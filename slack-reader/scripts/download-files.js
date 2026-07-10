#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const { parseSlackUrl } = require('../lib/url-parser');
const { getMessage, getThreadReplies, getFileInfo } = require('../lib/client');
const { collectFiles, downloadFile } = require('../lib/files');
const { createSession } = require('../lib/session');

const HELP = `
Download files and images uploaded to a Slack message.

Usage:
  node scripts/download-files.js --url <permalink> --output-dir <directory> [options]

Options:
  --url <permalink>      Slack message permalink (required)
  --output-dir <path>    Destination directory (required)
  --workspace <name>     Workspace alias from SLACK_WORKSPACES
  --include-thread       Download files from the complete thread
  --help                 Show this help message

Requires files:read. Existing files are preserved; duplicate names receive a numeric suffix.
`;

async function main() {
  const args = parseArgs();
  if (args.help) printHelp(HELP);
  if (!args.url) throw new SkillError('SLACK_URL_INVALID', 'Missing --url argument');
  if (!args.outputDir) throw new SkillError('SLACK_ARGUMENT_INVALID', '--output-dir is required');

  const { workspace: urlWorkspace, channelId, messageTs, threadTs } = parseSlackUrl(args.url);
  const { client, workspaceName, token } = createSession({ workspace: args.workspace, urlWorkspace });
  const targetMessage = await getMessage(client, channelId, messageTs, threadTs);
  let messages = [targetMessage];

  if (args.includeThread) {
    const resolvedThreadTs = threadTs || targetMessage.thread_ts || (targetMessage.reply_count ? targetMessage.ts : null);
    if (resolvedThreadTs) messages = await getThreadReplies(client, channelId, resolvedThreadTs);
  }

  const uniqueFiles = [];
  const seen = new Set();
  for (const entry of collectFiles(messages)) {
    const key = entry.file.id || `${entry.messageTs}:${entry.file.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFiles.push(entry);
    }
  }

  const downloaded = [];
  const failed = [];
  for (const { messageTs: attachedToMessageTs, file } of uniqueFiles) {
    try {
      const completeFile = file.id ? await getFileInfo(client, file.id) : file;
      downloaded.push({
        attachedToMessageTs,
        ...await downloadFile(completeFile, token, args.outputDir),
      });
    } catch (err) {
      failed.push({
        attachedToMessageTs,
        id: file.id || null,
        name: file.name || null,
        error: err.toJSON ? err.toJSON() : { message: err.message },
      });
    }
  }

  outputJson({
    metadata: {
      url: args.url,
      fetchedAt: new Date().toISOString(),
      workspace: workspaceName,
      targetMessageTs: messageTs,
      includedThread: Boolean(args.includeThread),
      fileCount: uniqueFiles.length,
    },
    downloaded,
    failed,
  });

  if (failed.length > 0) process.exitCode = 1;
}

main().catch(outputError);
