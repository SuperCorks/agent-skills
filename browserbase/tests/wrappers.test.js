const test = require('node:test');
const assert = require('node:assert/strict');
const { chmodSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const skillDir = join(__dirname, '..');

function fakeBrowsePath() {
  const directory = mkdtempSync(join(tmpdir(), 'browserbase-skill-test-'));
  const executable = join(directory, 'browse');
  writeFileSync(executable, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  argv: process.argv.slice(2),
  apiKey: process.env.BROWSERBASE_API_KEY,
  contextId: process.env.BROWSERBASE_CONTEXT_ID,
  session: process.env.BROWSE_SESSION,
  loadDotenv: process.env.BROWSE_LOAD_DOTENV,
}));
`);
  chmodSync(executable, 0o700);
  return directory;
}

test('run-browse selects one account, isolates its session, and injects its context', () => {
  const fakeDirectory = fakeBrowsePath();
  const result = spawnSync(process.execPath, [
    join(skillDir, 'scripts/run-browse.js'),
    '--account',
    'prod',
    '--',
    'cloud',
    'sessions',
    'create',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeDirectory}:${process.env.PATH}`,
      BROWSERBASE_ACCOUNTS: JSON.stringify({
        prod: { apiKey: 'bb_prod_secret', contextId: 'ctx_prod_secret' },
        sandbox: { apiKey: 'bb_sandbox_secret' },
      }),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.argv, [
    'cloud',
    'sessions',
    'create',
    '--context-id',
    'ctx_prod_secret',
    '--persist',
  ]);
  assert.equal(output.apiKey, 'bb_prod_secret');
  assert.equal(output.contextId, 'ctx_prod_secret');
  assert.equal(output.session, 'browserbase-prod');
  assert.equal(output.loadDotenv, '0');
});

test('list-accounts does not reveal configured secrets', () => {
  const result = spawnSync(process.execPath, [join(skillDir, 'scripts/list-accounts.js')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BROWSERBASE_ACCOUNTS: JSON.stringify({
        prod: { apiKey: 'bb_prod_secret', contextId: 'ctx_prod_secret' },
      }),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /bb_prod_secret|ctx_prod_secret/);
  assert.match(result.stdout, /"prod"/);
});

test('run-browse can attach the account context without persisting changes', () => {
  const fakeDirectory = fakeBrowsePath();
  const result = spawnSync(process.execPath, [
    join(skillDir, 'scripts/run-browse.js'),
    '--account',
    'prod',
    '--read-only-context',
    '--',
    'cloud',
    'sessions',
    'create',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeDirectory}:${process.env.PATH}`,
      BROWSERBASE_ACCOUNTS: JSON.stringify({
        prod: { apiKey: 'bb_prod_secret', contextId: 'ctx_prod_secret' },
      }),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).argv, [
    'cloud',
    'sessions',
    'create',
    '--context-id',
    'ctx_prod_secret',
  ]);
});
