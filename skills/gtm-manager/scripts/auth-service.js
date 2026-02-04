#!/usr/bin/env node
const { getServiceAuth, getTagManager, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Authenticate with GTM API using a service account.

Usage:
  node auth-service.js --service-key <path>

Options:
  --service-key <path>  Path to service account key JSON
  -h, --help            Show this help

Environment variables:
  GTM_SERVICE_KEY_PATH  Default service key path

Example:
  node auth-service.js --service-key ./service-account.json

Note:
  The service account email must have GTM permissions granted
  via Admin > User Management in the GTM web interface.
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.serviceKey) {
    error('Must provide --service-key path');
  }

  const auth = getServiceAuth(args.serviceKey);
  const tagmanager = getTagManager(auth);
  
  // Verify by listing accounts
  const res = await tagmanager.accounts.list();
  
  output({
    success: true,
    message: 'Service account authentication successful',
    accounts: res.data.account?.length || 0,
  });
}

main().catch(e => error(e.message));
