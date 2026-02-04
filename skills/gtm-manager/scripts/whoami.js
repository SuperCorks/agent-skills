#!/usr/bin/env node
const { google } = require('googleapis');
const { getAuth, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Show the currently authenticated Google account.

Usage:
  node whoami.js --credentials <path> --token <path>

Options:
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  -h, --help            Show this help

Output:
  JSON object with email and token info
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.credentials || !args.token) {
    error('Must provide --credentials and --token');
  }

  const auth = getAuth(args.credentials, args.token);
  
  // Get token info to see which account is logged in
  const oauth2 = google.oauth2({ version: 'v2', auth });
  
  try {
    const userInfo = await oauth2.userinfo.get();
    output({
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    });
  } catch (e) {
    // If userinfo scope not available, show token details
    const tokenInfo = await auth.getAccessToken();
    const credentials = auth.credentials;
    output({
      note: 'userinfo scope not available - showing token details',
      scope: credentials.scope,
      expiry_date: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
    });
  }
}

main().catch(e => error(e.message));
