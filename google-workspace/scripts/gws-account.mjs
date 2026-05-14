#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const HELP = `
Google Workspace multi-account helper.

Usage:
  node scripts/gws-account.mjs list
  node scripts/gws-account.mjs resolve [--account alias]
  node scripts/gws-account.mjs env [--account alias]
  node scripts/gws-account.mjs status [--account alias]
  node scripts/gws-account.mjs whoami [--account alias]
  node scripts/gws-account.mjs run [--account alias] -- <gws args...>
  node scripts/gws-account.mjs enroll --account alias [--email address] [--credentials-file path] [--config-file path] [--scopes csv]

Environment:
  GOOGLE_WORKSPACE_ACCOUNTS  JSON object mapping aliases to credential file paths or account objects.
                             Example: {"sim":{"email":"simon@example.com","credentialsFile":"~/.config/gws/accounts/sim.json"}}
  GOOGLE_WORKSPACE_ACCOUNT   Optional default alias when multiple accounts are configured.

Default config file:
  ~/.config/gws/accounts.json

Account object fields:
  credentialsFile            Path to a gws exported OAuth credentials JSON file.
  email                      Optional expected email, used for display and operator checks.
  scopes or defaultScopes    Optional documentation-only scope list.

Commands:
  list                       Print configured aliases without secrets.
  resolve                    Print the selected account metadata without secrets.
  env                        Print shell exports for the selected account.
  status                     Run: gws auth status for the selected account.
  whoami                     Run: gws drive about get --params '{"fields":"user"}'.
  run                        Run arbitrary gws arguments using the selected account.
  enroll                     Run gws auth login, export credentials, and save them as a per-account file.

Examples:
  node scripts/gws-account.mjs enroll --account sim --email simoncorcos.ing@gmail.com
  node scripts/gws-account.mjs whoami --account sim
  node scripts/gws-account.mjs run --account sim -- drive files list --params '{"pageSize":10}'
`;

class SkillError extends Error {
  constructor(code, message, remediation) {
    super(message);
    this.name = 'SkillError';
    this.code = code;
    this.remediation = remediation;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      remediation: this.remediation,
    };
  }
}

function printHelpAndExit() {
  console.log(HELP.trim());
  process.exit(0);
}

function expandPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;
  if (inputPath === '~') return homedir();
  if (inputPath.startsWith('~/')) return resolve(homedir(), inputPath.slice(2));
  return inputPath.replace(/\$HOME\b/g, homedir());
}

function defaultCredentialsFile(alias) {
  return resolve(homedir(), '.config', 'gws', 'accounts', `${alias}.json`);
}

function defaultAccountsConfigFile() {
  return resolve(homedir(), '.config', 'gws', 'accounts.json');
}

function normalizeAlias(alias) {
  return String(alias || '').trim().toLowerCase();
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
  const args = {
    command,
    account: undefined,
    config: process.env.GOOGLE_WORKSPACE_ACCOUNTS,
    configFile: undefined,
    credentialsFile: undefined,
    email: undefined,
    scopes: undefined,
    services: undefined,
    readonly: false,
    full: false,
    gwsArgs: [],
  };

  const commandArgs = command === 'help' && argv[0]?.startsWith('-') ? argv : argv.slice(1);
  for (let index = 0; index < commandArgs.length; index += 1) {
    const value = commandArgs[index];

    if (value === '--') {
      args.gwsArgs = commandArgs.slice(index + 1);
      break;
    }

    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--readonly') args.readonly = true;
    else if (value === '--full') args.full = true;
    else if (value === '--account') args.account = commandArgs[++index];
    else if (value === '--config') args.config = commandArgs[++index];
    else if (value === '--config-file') args.configFile = commandArgs[++index];
    else if (value === '--credentials-file') args.credentialsFile = commandArgs[++index];
    else if (value === '--email') args.email = commandArgs[++index];
    else if (value === '--scopes') args.scopes = commandArgs[++index];
    else if (value === '--services') args.services = commandArgs[++index];
    else {
      args.gwsArgs.push(value);
    }
  }

  return args;
}

function readConfigValue(configFile) {
  if (process.env.GOOGLE_WORKSPACE_ACCOUNTS) {
    return process.env.GOOGLE_WORKSPACE_ACCOUNTS;
  }

  const resolvedConfigFile = expandPath(configFile || defaultAccountsConfigFile());
  if (existsSync(resolvedConfigFile)) {
    return readFileSync(resolvedConfigFile, 'utf8');
  }

  return '';
}

function parseAccounts(configValue) {
  const accounts = new Map();

  if (!configValue || !configValue.trim()) {
    const credentialsFile = process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE;
    if (credentialsFile) {
      accounts.set('default', {
        name: 'default',
        credentialsFile: expandPath(credentialsFile),
        email: undefined,
      });
    }
    return accounts;
  }

  let parsed;
  try {
    parsed = JSON.parse(configValue);
  } catch (error) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_ACCOUNTS_INVALID',
      `GOOGLE_WORKSPACE_ACCOUNTS is not valid JSON: ${error.message}`,
      'Set GOOGLE_WORKSPACE_ACCOUNTS to a JSON object such as {"sim":{"credentialsFile":"~/.config/gws/accounts/sim.json"}}.',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_ACCOUNTS_INVALID',
      'GOOGLE_WORKSPACE_ACCOUNTS must be a JSON object.',
      'Use aliases as keys and credential file paths or account objects as values.',
    );
  }

  for (const [rawAlias, rawAccount] of Object.entries(parsed)) {
    const alias = normalizeAlias(rawAlias);
    if (!alias) {
      throw new SkillError('GOOGLE_WORKSPACE_ACCOUNTS_INVALID', 'Account aliases cannot be empty.', 'Use stable aliases such as sim, work, or client_a.');
    }

    if (typeof rawAccount === 'string') {
      accounts.set(alias, {
        name: alias,
        credentialsFile: expandPath(rawAccount),
        email: undefined,
      });
      continue;
    }

    if (!rawAccount || typeof rawAccount !== 'object' || Array.isArray(rawAccount)) {
      throw new SkillError(
        'GOOGLE_WORKSPACE_ACCOUNTS_INVALID',
        `Account "${alias}" must be a credential path string or object.`,
        'Use {"credentialsFile":"~/.config/gws/accounts/name.json","email":"name@example.com"}.',
      );
    }

    const credentialsFile = rawAccount.credentialsFile || rawAccount.credentials_file || rawAccount.file;
    if (typeof credentialsFile !== 'string' || !credentialsFile.trim()) {
      throw new SkillError(
        'GOOGLE_WORKSPACE_ACCOUNTS_INVALID',
        `Account "${alias}" is missing credentialsFile.`,
        'Add a credentialsFile path for this account.',
      );
    }

    accounts.set(alias, {
      name: alias,
      credentialsFile: expandPath(credentialsFile),
      email: typeof rawAccount.email === 'string' ? rawAccount.email : undefined,
      scopes: rawAccount.scopes || rawAccount.defaultScopes || rawAccount.default_scopes,
    });
  }

  return accounts;
}

function resolveAccount(accounts, requestedAccount) {
  const accountCount = accounts.size;
  const envDefault = process.env.GOOGLE_WORKSPACE_ACCOUNT;
  const requested = normalizeAlias(requestedAccount || envDefault);

  if (requested) {
    const account = accounts.get(requested);
    if (!account) {
      const available = [...accounts.keys()].join(', ') || '(none)';
      throw new SkillError(
        'GOOGLE_WORKSPACE_ACCOUNT_NOT_FOUND',
        `Account "${requested}" not found. Available accounts: ${available}`,
        'Check GOOGLE_WORKSPACE_ACCOUNTS or pass an existing --account alias.',
      );
    }
    return account;
  }

  if (accountCount === 0) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_AUTH_MISSING',
      'No Google Workspace accounts are configured.',
      'Set GOOGLE_WORKSPACE_ACCOUNTS or run enroll with --account to create a per-account credential file.',
    );
  }

  if (accountCount === 1) {
    return [...accounts.values()][0];
  }

  const available = [...accounts.keys()].join(', ');
  throw new SkillError(
    'GOOGLE_WORKSPACE_ACCOUNT_AMBIGUOUS',
    `Multiple Google Workspace accounts are configured: ${available}`,
    'Pass --account <alias> or set GOOGLE_WORKSPACE_ACCOUNT for this shell/session.',
  );
}

function requireCredentialsFile(account) {
  if (!existsSync(account.credentialsFile)) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_CREDENTIALS_MISSING',
      `Credential file for "${account.name}" does not exist: ${account.credentialsFile}`,
      `Run: node scripts/gws-account.mjs enroll --account ${account.name}`,
    );
  }
}

function accountEnv(account) {
  return {
    ...process.env,
    GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: account.credentialsFile,
    GOOGLE_WORKSPACE_CLI_TOKEN: '',
  };
}

function gwsCommand(args, options = {}) {
  return spawnSync('npx', ['--yes', '@googleworkspace/cli', ...args], {
    stdio: options.stdio || 'inherit',
    env: options.env || process.env,
    encoding: options.encoding || 'utf8',
  });
}

function runGws(account, gwsArgs) {
  requireCredentialsFile(account);
  const result = gwsCommand(gwsArgs, { env: accountEnv(account) });
  process.exit(result.status ?? 1);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function listAccounts(accounts) {
  const rows = [...accounts.values()].map((account) => ({
    account: account.name,
    email: account.email || null,
    credentialsFile: account.credentialsFile,
    exists: existsSync(account.credentialsFile),
  }));
  printJson({ accounts: rows });
}

function printResolved(account) {
  printJson({
    account: account.name,
    email: account.email || null,
    credentialsFile: account.credentialsFile,
    exists: existsSync(account.credentialsFile),
  });
}

function printEnv(account) {
  console.log(`export GOOGLE_WORKSPACE_ACCOUNT=${shellQuote(account.name)}`);
  console.log(`export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=${shellQuote(account.credentialsFile)}`);
  console.log('unset GOOGLE_WORKSPACE_CLI_TOKEN');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function enroll(args) {
  const alias = normalizeAlias(args.account || process.env.GOOGLE_WORKSPACE_ACCOUNT);
  if (!alias) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_ACCOUNT_REQUIRED',
      'enroll requires --account <alias>.',
      'Choose a stable alias such as sim, work, or client_a.',
    );
  }

  const credentialsFile = resolve(expandPath(args.credentialsFile || defaultCredentialsFile(alias)));
  mkdirSync(dirname(credentialsFile), { recursive: true, mode: 0o700 });

  const loginArgs = ['auth', 'login'];
  if (args.full) loginArgs.push('--full');
  else if (args.readonly) loginArgs.push('--readonly');
  else if (args.services) loginArgs.push('--services', args.services);
  else loginArgs.push('--scopes', args.scopes || DEFAULT_SCOPES.join(','));

  console.error(`Opening Google OAuth login for account alias "${alias}"...`);
  const loginResult = gwsCommand(loginArgs);
  if (loginResult.status !== 0) {
    process.exit(loginResult.status ?? 1);
  }

  const exportResult = gwsCommand(['auth', 'export', '--unmasked'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (exportResult.status !== 0) {
    process.exit(exportResult.status ?? 1);
  }

  const exportedCredentials = String(exportResult.stdout || '').trim();
  if (!exportedCredentials) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_EXPORT_EMPTY',
      'gws auth export returned no credentials.',
      'Run gws auth status to verify login, then retry enroll.',
    );
  }

  try {
    JSON.parse(exportedCredentials);
  } catch (error) {
    throw new SkillError(
      'GOOGLE_WORKSPACE_EXPORT_INVALID',
      `gws auth export did not return JSON: ${error.message}`,
      'Run gws auth status to verify login, then retry enroll.',
    );
  }

  writeFileSync(credentialsFile, `${exportedCredentials}\n`, { mode: 0o600 });
  chmodSync(credentialsFile, 0o600);

  console.error(`Saved credentials for "${alias}" to ${credentialsFile}`);

  const configFile = resolve(expandPath(args.configFile || defaultAccountsConfigFile()));
  const existingConfig = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  const updatedConfig = {
    ...existingConfig,
    [alias]: {
      ...(args.email ? { email: args.email } : existingConfig[alias]?.email ? { email: existingConfig[alias].email } : {}),
      credentialsFile,
    },
  };
  mkdirSync(dirname(configFile), { recursive: true, mode: 0o700 });
  writeFileSync(configFile, `${JSON.stringify(updatedConfig, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configFile, 0o600);

  printJson({
    account: alias,
    email: args.email || null,
    credentialsFile,
    configFile,
    configSnippet: {
      [alias]: {
        ...(args.email ? { email: args.email } : {}),
        credentialsFile,
      },
    },
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === 'help') printHelpAndExit();

  if (args.command === 'enroll') {
    enroll(args);
    return;
  }

  const accounts = parseAccounts(args.config || readConfigValue(args.configFile));

  if (args.command === 'list') {
    listAccounts(accounts);
    return;
  }

  const account = resolveAccount(accounts, args.account);

  if (args.command === 'resolve') {
    printResolved(account);
    return;
  }

  if (args.command === 'env') {
    printEnv(account);
    return;
  }

  if (args.command === 'status') {
    runGws(account, ['auth', 'status']);
    return;
  }

  if (args.command === 'whoami') {
    runGws(account, ['drive', 'about', 'get', '--params', '{"fields":"user"}']);
    return;
  }

  if (args.command === 'run') {
    if (args.gwsArgs.length === 0) {
      throw new SkillError(
        'GOOGLE_WORKSPACE_COMMAND_REQUIRED',
        'run requires gws arguments after --.',
        'Example: node scripts/gws-account.mjs run --account sim -- drive files list --params \'{"pageSize":10}\'',
      );
    }
    runGws(account, args.gwsArgs);
    return;
  }

  throw new SkillError(
    'GOOGLE_WORKSPACE_COMMAND_UNKNOWN',
    `Unknown command: ${args.command}`,
    'Run with --help to see supported commands.',
  );
}

try {
  main();
} catch (error) {
  if (error instanceof SkillError) {
    console.error(JSON.stringify(error.toJSON(), null, 2));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
