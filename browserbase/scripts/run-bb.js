#!/usr/bin/env node

const { parseArgs, printHelp, outputError, requirePassthroughCommand } = require('../lib/cli');
const { parseAccounts, resolveAccount, buildAccountEnv } = require('../lib/accounts');
const { translateLegacyBbArgs, withAccountContext } = require('../lib/commands');
const { resolveExecutable, runCommand } = require('../lib/command');

const HELP = `
Compatibility wrapper for legacy bb command shapes.

The current Browserbase CLI is the unified browse package. Prefer run-browse.js
for new workflows. This wrapper translates legacy cloud topics such as
"projects list" to "browse cloud projects list".

Usage:
  node scripts/run-bb.js [--account <name>] [--read-only-context | --no-account-context] -- <legacy bb args...>

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

  const commandArgs = requirePassthroughCommand(passthrough, 'Browserbase');
  const executable = resolveExecutable(
    'browse',
    'Run: npm install -g browse or rely on the npx fallback',
    'browse'
  );

  const accounts = parseAccounts(process.env.BROWSERBASE_ACCOUNTS);
  const account = resolveAccount(accounts, args.account);
  const env = buildAccountEnv(account);

  const translatedArgs = withAccountContext(translateLegacyBbArgs(commandArgs), account, args);
  runCommand(executable.command, [...executable.prefixArgs, ...translatedArgs], { env });
}

try {
  main();
} catch (error) {
  outputError(error);
}