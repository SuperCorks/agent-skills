'use strict';

const fs = require('node:fs');
const { SkillError } = require('./errors');

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) throw new SkillError('ASANA_ARGUMENT_INVALID', `Unexpected positional argument: ${raw}`);
    const token = raw.slice(2);
    if (!token) throw new SkillError('ASANA_ARGUMENT_INVALID', 'Empty option');
    let key;
    let value;
    if (token.includes('=')) {
      const separator = token.indexOf('=');
      key = camelCase(token.slice(0, separator));
      value = token.slice(separator + 1);
    } else {
      key = camelCase(token);
      if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
        value = argv[index + 1];
        index += 1;
      } else {
        value = true;
      }
    }
    if (result[key] !== undefined) throw new SkillError('ASANA_ARGUMENT_INVALID', `Option --${token.split('=')[0]} was supplied more than once`);
    result[key] = value;
  }
  return result;
}

function parseJsonObject(raw, label) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new SkillError('ASANA_ARGUMENT_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SkillError('ASANA_ARGUMENT_INVALID', `${label} must contain a JSON object`);
  }
  return value;
}

function readData(args) {
  if (args.dataJson !== undefined && args.dataFile !== undefined) {
    throw new SkillError('ASANA_ARGUMENT_INVALID', '--data-json and --data-file are mutually exclusive');
  }
  if (args.dataJson !== undefined) return parseJsonObject(String(args.dataJson), '--data-json');
  if (args.dataFile !== undefined) {
    let content;
    try {
      content = fs.readFileSync(String(args.dataFile), 'utf8');
    } catch (error) {
      throw new SkillError('ASANA_ARGUMENT_INVALID', `Could not read --data-file: ${error.message}`);
    }
    return parseJsonObject(content, '--data-file');
  }
  return {};
}

function outputJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function outputError(error) {
  const normalized = error instanceof SkillError
    ? error
    : new SkillError('ASANA_API_ERROR', error?.message || String(error));
  process.stderr.write(`${JSON.stringify({ error: normalized.toJSON() }, null, 2)}\n`);
  process.exitCode = 1;
}

module.exports = { parseArgs, readData, outputJson, outputError };
