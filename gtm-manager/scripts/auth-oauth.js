#!/usr/bin/env node
const {
  authenticateOAuth,
  getTagManager,
  parseArgs,
  output,
  error,
} = require('./gtm-lib');

const HELP = `
Authenticate with GTM API using OAuth (browser flow).

Usage:
  node auth-oauth.js [--credentials <path|json>] [--token <path>]

Options:
  --credentials <path|json>  Path to OAuth client secrets JSON or inline JSON
  --token <path>             Path to save/load token
  -h, --help            Show this help

Environment variables:
  GTM_MANAGER_SKILL_CREDS_JSON  OAuth client credentials JSON string
  GTM_CREDENTIALS_PATH          Default credentials path (fallback)
  GTM_TOKEN_PATH                Default token path (fallback)

Example:
  node auth-oauth.js --credentials ./client_secrets.json --token ./token.json
  node auth-oauth.js  # uses GTM_MANAGER_SKILL_CREDS_JSON and project token default
`;

const TESTER_AUDIENCE_URL =
  'https://console.cloud.google.com/auth/audience?project=my-project-1478832460965';

function printTesterReminder() {
  console.error('------------------------------------------------------------');
  console.error('OAuth tester access reminder');
  console.error(
    `If login is blocked, add the user as a tester in Google Cloud: ${TESTER_AUDIENCE_URL}`
  );
  console.error('Project: My Project');
  console.error('Owner account: simoncorcos.ing@gmail.com');
  console.error('------------------------------------------------------------');
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.credentials) {
    error(
      'No credentials available. Provide --credentials or set GTM_MANAGER_SKILL_CREDS_JSON.'
    );
  }

  printTesterReminder();

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

main().catch((e) => error(e.message));
