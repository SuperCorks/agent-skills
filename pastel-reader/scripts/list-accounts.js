#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { summarizeAuthConfig } = require('../lib/auth');

const HELP = `
List configured Pastel account aliases.

Usage:
  node scripts/list-accounts.js [options]

Options:
  --zshrc <path>        Override the zsh config path. Default: ~/.zshrc
  --help                Show this help message

Environment:
  PASTEL_ACCOUNTS       JSON object mapping account aliases to API tokens
  PASTEL_ACCOUNT        Default account alias
  PASTEL_API_TOKEN      Single-token fallback
`;

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
  }

  outputJson(summarizeAuthConfig({ zshrcPath: args.zshrc }));
}

try {
  main();
} catch (error) {
  outputError(error);
}
