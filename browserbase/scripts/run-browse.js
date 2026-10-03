#!/usr/bin/env node

const { parseArgs, printHelp, outputError, requirePassthroughCommand } = require('../lib/cli');
const { parseAccounts, resolveAccount, buildAccountEnv } = require('../lib/accounts');
const { withAccountContext } = require('../lib/commands');
const { resolveExecutable, runCommand } = require('../lib/command');

const HELP = `
Run the browse CLI with a selected Browserbase account.

Usage:
  node scripts/run-browse.js [--account <name>] [--read-only-context | --no-account-context] -- <browse args...>

Examples:
  node scripts/run-browse.js --account prod -- open https://example.com --remote
  node scripts/run-browse.js --account prod -- cloud projects list
  node scripts/run-browse.js --account prod -- cloud sessions create
  node scripts/run-browse.js --account prod --read-only-context -- cloud sessions create
  node scripts/run-browse.js --account prod --no-account-context -- cloud sessions create
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
    'Run: npm install -g browse or rely on the npx fallback',
    'browse'
  );

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const account = resolveAccount(accounts, args.account);
  const env = buildAccountEnv(account);

  runCommand(executable.command, [...executable.prefixArgs, ...withResolvedContext(commandArgs, account, args)], { env });
}

function withResolvedContext(commandArgs, account, args) {
  return withAccountContext(commandArgs, account, args);
}

try {
  main();
} catch (error) {
  outputError(error);
}