function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.includes('=')) {
      const [key, ...valueParts] = withoutPrefix.split('=');
      args[toCamelCase(key)] = valueParts.join('=');
      continue;
    }

    const key = toCamelCase(withoutPrefix);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseInteger(value, flagName, { min, max } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return { valid: false, message: `${flagName} must be an integer` };
  }
  if (min !== undefined && number < min) {
    return { valid: false, message: `${flagName} must be at least ${min}` };
  }
  if (max !== undefined && number > max) {
    return { valid: false, message: `${flagName} must be at most ${max}` };
  }
  return { valid: true, value: number };
}

function parseJsonFlag(value, flagName) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${flagName} must be valid JSON: ${error.message}`);
  }
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
  parseInteger,
  parseJsonFlag,
  printHelp,
  outputJson,
  outputError,
};