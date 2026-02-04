#!/usr/bin/env node
const { authenticateOAuth, getTagManager, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Authenticate with GTM API using OAuth (browser flow).

Usage:
  node auth-oauth.js --credentials <path> --token <path>

Options:
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to save/load token
  -h, --help            Show this help

Environment variables:
  GTM_CREDENTIALS_PATH  Default credentials path
  GTM_TOKEN_PATH        Default token path

Example:
  node auth-oauth.js --credentials ./client_secrets.json --token ./token.json
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.credentials || !args.token) {
    error('Must provide --credentials and --token paths');
  }

  const auth = await authenticateOAuth(args.credentials, args.token);
  const tagmanager = getTagManager(auth);
  
  // Verify by listing accounts
  const res = await tagmanager.accounts.list();
  
  output({
    success: true,
    message: 'Authentication successful',
    accounts: res.data.account?.length || 0,
  });
}

main().catch(e => error(e.message));
