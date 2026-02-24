/**
 * CLI utilities for Iterable Reader skill
 */

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
  printHelp,
  outputJson,
  outputError,
};
