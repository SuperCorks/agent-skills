const { spawnSync } = require('child_process');
const { SkillError } = require('./errors');

function ensureExecutable(binary, installHint) {
  const result = spawnSync('which', [binary], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new SkillError('BROWSERBASE_CLI_MISSING', `${binary} not found. ${installHint}`);
  }

  return result.stdout.trim();
}

function resolveExecutable(binary, installHint, npxPackage) {
  const installedBinary = spawnSync('which', [binary], { encoding: 'utf8' });
  if (installedBinary.status === 0) {
    return {
      command: binary,
      prefixArgs: [],
      source: 'installed',
    };
  }

  if (npxPackage) {
    const npxBinary = spawnSync('which', ['npx'], { encoding: 'utf8' });
    if (npxBinary.status === 0) {
      return {
        command: 'npx',
        prefixArgs: ['--yes', npxPackage],
        source: 'npx',
      };
    }
  }

  throw new SkillError('BROWSERBASE_CLI_MISSING', `${binary} not found. ${installHint}`);
}

function runCommand(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
    env: options.env || process.env,
  });

  if (result.error) {
    throw new SkillError('BROWSERBASE_COMMAND_FAILED', result.error.message);
  }

  if (result.status !== 0) {
    const detail = `${binary} ${args.join(' ')} exited with ${result.status}`;
    throw new SkillError('BROWSERBASE_COMMAND_FAILED', detail);
  }

  return result;
}

module.exports = {
  ensureExecutable,
  resolveExecutable,
  runCommand,
};