#!/usr/bin/env node

const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { SkillError } = require('../lib/errors');
const {
  summarizeAuthConfig,
  upsertZshrcAccount,
  replaceZshrcAccount,
  removeZshrcAccount,
  setDefaultZshrcAccount,
} = require('../lib/auth');

const HELP = `
Manage Pastel account aliases in ~/.zshrc.

Usage:
  node scripts/auth.js list [options]
  node scripts/auth.js set --account ALIAS --token TOKEN [--default] [options]
  node scripts/auth.js replace --account ALIAS --token TOKEN [--default] [options]
  node scripts/auth.js use --account ALIAS [options]
  node scripts/auth.js remove --account ALIAS [options]

Commands:
  list                  List configured aliases with redacted tokens
  set                   Add or update an alias token in the managed ~/.zshrc block
  replace               Replace an existing alias token
  use                   Set the default account alias
  remove                Remove an alias from the managed ~/.zshrc block

Options:
  --account <alias>     Account alias
  --token <token>       Pastel API token
  --default             Make the alias the default account
  --zshrc <path>        Override the zsh config path. Default: ~/.zshrc
  --help                Show this help message
`;

function main() {
  const args = parseArgs();
  const command = String((args._ || [])[0] || '').toLowerCase();

  if (args.help || !command) {
    printHelp(HELP);
  }

  const options = {
    account: args.account || args.alias,
    token: args.token || args.apiToken,
    makeDefault: Boolean(args.default),
    zshrcPath: args.zshrc,
  };

  if (command === 'list' || command === 'ls') {
    outputJson(summarizeAuthConfig({ zshrcPath: args.zshrc }));
    return;
  }

  if (command === 'set' || command === 'add') {
    outputJson({
      operation: 'set-account',
      ...upsertZshrcAccount(options),
    });
    return;
  }

  if (command === 'replace') {
    outputJson({
      operation: 'replace-account',
      ...replaceZshrcAccount(options),
    });
    return;
  }

  if (command === 'use' || command === 'default') {
    outputJson({
      operation: 'set-default-account',
      ...setDefaultZshrcAccount(options),
    });
    return;
  }

  if (command === 'remove' || command === 'rm' || command === 'delete') {
    outputJson({
      operation: 'remove-account',
      ...removeZshrcAccount(options),
    });
    return;
  }

  throw new SkillError('PASTEL_ARGS_INVALID', `Unknown auth command: ${command}`);
}

try {
  main();
} catch (error) {
  outputError(error);
}
