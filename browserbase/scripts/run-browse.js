#!/usr/bin/env node

const { parseArgs, printHelp, outputError, requirePassthroughCommand } = require('../lib/cli');
const { parseAccounts, resolveAccount, buildAccountEnv } = require('../lib/accounts');
const { resolveExecutable, runCommand } = require('../lib/command');

const HELP = `
Run the browse CLI with a selected Browserbase account.

Usage:
  node scripts/run-browse.js [--account <name>] -- <browse args...>

Examples:
  node scripts/run-browse.js --account prod -- env remote
  node scripts/run-browse.js --account prod -- open https://example.com
  node scripts/run-browse.js --account prod --no-account-context -- open https://example.com
  node scripts/run-browse.js --account prod -- snapshot
  node scripts/run-browse.js --account prod -- stop
`;

function main() {
  const { args, passthrough } = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const commandArgs = requirePassthroughCommand(passthrough, 'browse');
  const executable = resolveExecutable(
    'browse',
    'Run: npm install -g @browserbasehq/browse-cli or rely on npx fallback',
    '@browserbasehq/browse-cli'
  );

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const account = resolveAccount(accounts, args.account);
  const env = buildAccountEnv(account);

  runCommand(executable.command, [...executable.prefixArgs, ...withResolvedContext(commandArgs, account, args)], { env });
}

function withResolvedContext(commandArgs, account, args) {
  if (args.noAccountContext || !account.contextId || commandArgs[0] !== 'open') {
    return commandArgs;
  }

  if (commandArgs.includes('--context-id') || commandArgs.some((arg) => arg.startsWith('--context-id='))) {
    return commandArgs;
  }

  return [...commandArgs, '--context-id', account.contextId, '--persist'];
}

try {
  main();
} catch (error) {
  outputError(error);
}