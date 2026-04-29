const { SkillError } = require('./errors');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  const positionals = [];
  let passthrough = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--') {
      passthrough = argv.slice(index + 1);
      break;
    }

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const withoutDashes = arg.slice(2);

    if (withoutDashes.includes('=')) {
      const [key, ...valueParts] = withoutDashes.split('=');
      args[toCamelCase(key)] = valueParts.join('=');
      continue;
    }

    const key = toCamelCase(withoutDashes);
    const nextArg = argv[index + 1];

    if (nextArg && !nextArg.startsWith('--')) {
      args[key] = nextArg;
      index++;
    } else {
      args[key] = true;
    }
  }

  return { args, positionals, passthrough };
}

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp(helpText) {
  console.log(helpText.trim());
  process.exit(0);
}

function outputJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function outputError(error) {
  const result = {
    error: error.toJSON ? error.toJSON() : {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      remediation: 'Check the error details and try again',
    },
  };

  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

function requirePassthroughCommand(passthrough, commandName) {
  if (!Array.isArray(passthrough) || passthrough.length === 0) {
    throw new SkillError('BROWSERBASE_ARGS_INVALID', `Pass ${commandName} arguments after --`);
  }

  return passthrough;
}

module.exports = {
  parseArgs,
  printHelp,
  outputJson,
  outputError,
  requirePassthroughCommand,
};