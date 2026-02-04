const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Get OAuth2 client from saved token
 */
function getAuth(credentialsPath, tokenPath) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  oauth2Client.setCredentials(token);
  return oauth2Client;
}

/**
 * Get service account auth
 */
function getServiceAuth(keyPath) {
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: SCOPES,
  });
}

/**
 * Authenticate via OAuth browser flow (interactive)
 */
async function authenticateOAuth(credentialsPath, tokenPath) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000/callback');

  // Check for existing token
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  const open = await import('open').then(m => m.default);
  
  const code = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.end('Authentication successful! You can close this tab.');
        server.close();
        resolve(query.code);
      }
    }).listen(3000, () => {
      console.error('Opening browser for authentication...');
      open(authUrl);
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.error('Token saved to', tokenPath);

  return oauth2Client;
}

/**
 * Get Tag Manager API client
 */
function getTagManager(auth) {
  return google.tagmanager({ version: 'v2', auth });
}

/**
 * Get default workspace for a container
 */
async function getWorkspace(tagmanager, accountId, containerId) {
  const containerPath = `accounts/${accountId}/containers/${containerId}`;
  const res = await tagmanager.accounts.containers.workspaces.list({
    parent: containerPath
  });
  return res.data.workspace[0];
}

/**
 * Parse CLI arguments
 */
function parseArgs(args = process.argv.slice(2)) {
  const parsed = {
    _: [],
    account: process.env.GTM_ACCOUNT_ID,
    container: process.env.GTM_CONTAINER_ID,
    credentials: process.env.GTM_CREDENTIALS_PATH,
    token: process.env.GTM_TOKEN_PATH,
    serviceKey: process.env.GTM_SERVICE_KEY_PATH,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--account' || arg === '-a') {
      parsed.account = args[++i];
    } else if (arg === '--container' || arg === '-c') {
      parsed.container = args[++i];
    } else if (arg === '--credentials') {
      parsed.credentials = args[++i];
    } else if (arg === '--token') {
      parsed.token = args[++i];
    } else if (arg === '--service-key') {
      parsed.serviceKey = args[++i];
    } else if (arg === '--id') {
      parsed.id = args[++i];
    } else if (arg === '--name') {
      parsed.name = args[++i];
    } else if (arg === '--type') {
      parsed.type = args[++i];
    } else if (arg === '--trigger') {
      parsed.trigger = args[++i];
    } else if (arg === '--json') {
      parsed.json = args[++i];
    } else if (arg === '--version-name') {
      parsed.versionName = args[++i];
    } else if (arg === '--notes') {
      parsed.notes = args[++i];
    } else if (!arg.startsWith('-')) {
      parsed._.push(arg);
    }
  }

  return parsed;
}

/**
 * Get authenticated Tag Manager client from args
 */
async function getClientFromArgs(args) {
  let auth;
  if (args.serviceKey) {
    auth = getServiceAuth(args.serviceKey);
  } else if (args.credentials && args.token) {
    auth = getAuth(args.credentials, args.token);
  } else {
    throw new Error('Must provide --credentials and --token, or --service-key');
  }
  return getTagManager(auth);
}

/**
 * Output JSON result
 */
function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Output error and exit
 */
function error(message, code = 1) {
  console.error('Error:', message);
  process.exit(code);
}

module.exports = {
  SCOPES,
  getAuth,
  getServiceAuth,
  authenticateOAuth,
  getTagManager,
  getWorkspace,
  parseArgs,
  getClientFromArgs,
  output,
  error,
};
