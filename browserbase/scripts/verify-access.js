#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { parseAccounts, resolveAccount, buildAccountEnv, summarizeAccount } = require('../lib/accounts');
const { ensureExecutable, runCommand } = require('../lib/command');

const HELP = `
Verify Browserbase API access for a selected account.

Usage:
  node scripts/verify-access.js [--account <name>]

Behavior:
  Runs a read-only bb projects list smoke test with the selected account.
`;

function main() {
  const { args } = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  ensureExecutable('bb', 'Run: npm install -g @browserbasehq/cli');

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const account = resolveAccount(accounts, args.account);
  const env = buildAccountEnv(account);
  const startedAt = new Date().toISOString();

  const result = runCommand('bb', ['projects', 'list'], {
    env,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  outputJson({
    metadata: {
      account: account.name,
      verifiedAt: startedAt,
      command: 'bb projects list',
    },
    account: summarizeAccount(account.name, account),
    verification: {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    },
  });
}

try {
  main();
} catch (error) {
  outputError(error);
}