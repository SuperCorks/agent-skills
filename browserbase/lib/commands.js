const CLOUD_TOPICS = new Set(['projects', 'sessions', 'contexts', 'extensions', 'fetch', 'search']);
const { SkillError } = require('./errors');

function withAccountContext(commandArgs, account, options = {}) {
  if (options.noAccountContext && options.readOnlyContext) {
    throw new SkillError(
      'BROWSERBASE_ARGS_INVALID',
      'Use either --read-only-context or --no-account-context, not both'
    );
  }

  if (
    options.noAccountContext ||
    !account.contextId ||
    commandArgs[0] !== 'cloud' ||
    commandArgs[1] !== 'sessions' ||
    commandArgs[2] !== 'create'
  ) {
    return commandArgs;
  }

  if (hasFlag(commandArgs, '--context-id')) {
    return commandArgs;
  }

  const resolved = [...commandArgs, '--context-id', account.contextId];
  if (!options.readOnlyContext && !hasFlag(resolved, '--persist')) {
    resolved.push('--persist');
  }

  return resolved;
}

function translateLegacyBbArgs(commandArgs) {
  if (commandArgs.length === 0 || commandArgs[0] === 'cloud' || commandArgs[0] === 'functions') {
    return commandArgs;
  }

  if (CLOUD_TOPICS.has(commandArgs[0])) {
    return ['cloud', ...commandArgs];
  }

  if (commandArgs[0] === 'browse') {
    const browseArgs = commandArgs.slice(1);
    if (browseArgs[0] && /^https?:\/\//.test(browseArgs[0])) {
      return ['open', ...browseArgs];
    }
    return browseArgs;
  }

  return commandArgs;
}

function hasFlag(args, flag) {
  return args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));
}

module.exports = {
  translateLegacyBbArgs,
  withAccountContext,
};
