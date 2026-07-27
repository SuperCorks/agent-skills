const fs = require('node:fs');
const { SkillError } = require('./errors');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new SkillError('POSTHOG_ARGS_INVALID', `Unexpected positional argument "${arg}"`);
    }

    const withoutDashes = arg.slice(2);
    if (!withoutDashes) {
      throw new SkillError('POSTHOG_ARGS_INVALID', 'Empty option name');
    }

    if (withoutDashes.includes('=')) {
      const [key, ...valueParts] = withoutDashes.split('=');
      args[toCamelCase(key)] = valueParts.join('=');
      continue;
    }

    const key = toCamelCase(withoutDashes);
    const nextArg = argv[index + 1];
    if (nextArg !== undefined && !nextArg.startsWith('--')) {
      args[key] = nextArg;
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

function parseInteger(value, name, options = {}) {
  if (value === undefined) {
    return options.defaultValue;
  }

  const parsed = Number(value);
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      `${name} must be an integer between ${min} and ${max}`
    );
  }
  return parsed;
}

function parseMethod(value) {
  const method = String(value || 'GET').toUpperCase();
  const supported = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!supported.includes(method)) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      `--method must be one of ${supported.join(', ')}`
    );
  }
  return method;
}

function readJsonInput({ json, file, label, required = false }) {
  if (json !== undefined && file !== undefined) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      `Use only one of --${label}-json or --${label}-file`
    );
  }

  let source;
  if (file !== undefined) {
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (error) {
      throw new SkillError('POSTHOG_ARGS_INVALID', `Cannot read ${label} file: ${error.message}`);
    }
  } else if (json !== undefined) {
    source = json;
  } else if (required) {
    throw new SkillError(
      'POSTHOG_ARGS_INVALID',
      `Provide --${label}-json or --${label}-file`
    );
  } else {
    return undefined;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SkillError('POSTHOG_ARGS_INVALID', `Invalid ${label} JSON: ${error.message}`);
  }
}

function assertObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SkillError('POSTHOG_ARGS_INVALID', `${label} must be a JSON object`);
  }
  return value;
}

function printHelp(helpText) {
  console.log(helpText.trim());
}

function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function outputError(error) {
  const result = {
    error: error.toJSON
      ? error.toJSON()
      : {
          code: 'UNKNOWN_ERROR',
          message: error.message,
          remediation: 'Inspect the error details and retry',
        },
  };

  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

module.exports = {
  parseArgs,
  parseInteger,
  parseMethod,
  readJsonInput,
  assertObject,
  printHelp,
  outputJson,
  outputError,
};
