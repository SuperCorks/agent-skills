#!/usr/bin/env node

const { parseArgs, printHelp, outputError, requirePassthroughCommand } = require('../lib/cli');
const { parseAccounts, resolveAccount, buildAccountEnv } = require('../lib/accounts');
const { resolveExecutable, runCommand } = require('../lib/command');

const HELP = `
Run the Browserbase bb CLI with a selected account.

Usage:
  node scripts/run-bb.js [--account <name>] -- <bb args...>

Examples:
  node scripts/run-bb.js --account prod -- projects list
  node scripts/run-bb.js --account prod -- sessions get <session_id>
  node scripts/run-bb.js --account prod -- fetch https://example.com --output /tmp/page.html
`;

function main() {
  const { args, passthrough } = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  const commandArgs = requirePassthroughCommand(passthrough, 'bb');
  const executable = resolveExecutable(
    'bb',
    'Run: npm install -g @browserbasehq/cli or rely on npx fallback',
    '@browserbasehq/cli'
  );

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const account = resolveAccount(accounts, args.account);
  const env = buildAccountEnv(account);

  runCommand(executable.command, [...executable.prefixArgs, ...commandArgs], { env });
}

try {
  main();
} catch (error) {
  outputError(error);
}