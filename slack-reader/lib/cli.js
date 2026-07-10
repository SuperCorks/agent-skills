/**
 * CLI utilities for Slack Reader skill
 */

const { SkillError } = require('./errors');

/**
 * Parse command-line arguments
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Object<string, string | boolean>}
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      const withoutDashes = arg.slice(2);
      
      // Handle --flag=value
      if (withoutDashes.includes('=')) {
        const [key, ...valueParts] = withoutDashes.split('=');
        args[toCamelCase(key)] = valueParts.join('=');
      }
      // Handle --flag value or --flag (boolean)
      else {
        const key = toCamelCase(withoutDashes);
        const nextArg = argv[i + 1];
        
        if (nextArg && !nextArg.startsWith('--')) {
          args[key] = nextArg;
          i++; // Skip next arg since we consumed it
        } else {
          args[key] = true;
        }
      }
    }
  }
  
  return args;
}

/**
 * Convert kebab-case to camelCase
 * @param {string} str
 * @returns {string}
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Parse and validate an integer CLI option.
 */
function parseInteger(value, { name, defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }) {
  if (value === undefined) return defaultValue;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new SkillError('SLACK_ARGUMENT_INVALID', `${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

/**
 * Parse a Slack timestamp or ISO 8601 date into a Slack timestamp.
 */
function parseTimestamp(value, name) {
  if (value === undefined) return undefined;
  if (/^\d{10}(?:\.\d{1,6})?$/.test(value)) return value;

  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new SkillError('SLACK_ARGUMENT_INVALID', `${name} must be a Slack timestamp or ISO 8601 date`);
  }

  return (millis / 1000).toFixed(6);
}

/**
 * Print help text and exit
 * @param {string} helpText
 */
function printHelp(helpText) {
  console.log(helpText);
  process.exit(0);
}

/**
 * Output JSON data to stdout
 * @param {any} data
 */
function outputJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Output error to stderr and exit
 * @param {Error} error
 */
function outputError(error) {
  const errorOutput = {
    error: error.toJSON ? error.toJSON() : {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      remediation: 'Check the error details and try again',
    },
  };
  
  console.error(JSON.stringify(errorOutput, null, 2));
  process.exit(1);
}

module.exports = {
  parseArgs,
  parseInteger,
  parseTimestamp,
  printHelp,
  outputJson,
  outputError,
};
