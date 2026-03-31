const { SkillError } = require('./errors');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
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

  return args;
}

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCsv(value) {
  if (!value) {
    return undefined;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new SkillError('GODADDY_ARGS_INVALID', `${fieldName} must be an integer`);
  }

  return parsed;
}

function printHelp(helpText) {
  console.log(helpText);
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

module.exports = {
  parseArgs,
  parseCsv,
  parseOptionalInteger,
  printHelp,
  outputJson,
  outputError,
};
