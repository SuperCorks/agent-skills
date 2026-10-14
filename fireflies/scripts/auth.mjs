import { spawnSync } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'Fireflies API Key';

export function validateAlias(alias) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(alias)) {
    throw new Error('Account aliases must be 1–64 letters, digits, dots, underscores, or hyphens.');
  }
  return alias;
}

export function validateKey(value) {
  const key = value?.trim();
  if (!key || /\s/.test(key) || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error('The API key is missing or contains whitespace/control characters.');
  }
  return key;
}

export function resolveCredential(alias = 'default', env = process.env) {
  validateAlias(alias);
  // A default environment key must never silently replace a named account.
  if (alias === 'default' && env.FIREFLIES_API_KEY) {
    return { key: validateKey(env.FIREFLIES_API_KEY), source: 'FIREFLIES_API_KEY', alias };
  }
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/bin/security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', alias, '-w',
    ], { encoding: 'utf8', timeout: 30_000 });
    if (result.status === 0 && result.stdout.trim()) {
      return { key: validateKey(result.stdout), source: 'macOS Keychain', alias };
    }
  }
  throw new Error(`No Fireflies credential for account '${alias}'. Store it with auth store --stdin${alias === 'default' ? ' or set FIREFLIES_API_KEY' : ` --account ${alias}`}.`);
}

export function storeCredential(key, alias = 'default') {
  validateAlias(alias);
  key = validateKey(key);
  if (process.platform !== 'darwin') {
    throw new Error('Keychain storage requires macOS. Use FIREFLIES_API_KEY on other systems.');
  }
  const quote = value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  // Interactive security reads the secret from stdin; it never appears in argv.
  const command = `add-generic-password -U -s ${quote(KEYCHAIN_SERVICE)} -a ${quote(alias)} -w ${quote(key)}\n`;
  const write = spawnSync('/usr/bin/security', ['-i'], {
    input: command, encoding: 'utf8', timeout: 30_000,
  });
  // security -i may exit successfully even if an individual command fails.
  const read = spawnSync('/usr/bin/security', [
    'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', alias, '-w',
  ], { encoding: 'utf8', timeout: 30_000 });
  if (write.error || write.status !== 0 || read.status !== 0 || read.stdout.trim() !== key) {
    throw new Error('Could not store and verify the Fireflies key in macOS Keychain.');
  }
}
