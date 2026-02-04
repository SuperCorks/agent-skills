#!/usr/bin/env node
const { getClientFromArgs, getWorkspace, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
Publish a GTM container version.

Usage:
  node publish.js --account <id> --container <id> --credentials <path> --token <path>

Options:
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --version-name <name> Name for the new version
  --notes <notes>       Version notes/description
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Process:
  1. Creates a new version from the current workspace
  2. Publishes the version

Output:
  Published version details
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.account || !args.container) {
    error('Must provide --account and --container IDs');
  }

  const tagmanager = await getClientFromArgs(args);
  const workspace = await getWorkspace(tagmanager, args.account, args.container);

  // Create a version from the workspace
  console.error('Creating version from workspace...');
  const createRes = await tagmanager.accounts.containers.workspaces.create_version({
    path: workspace.path,
    requestBody: {
      name: args.versionName || `Version ${new Date().toISOString()}`,
      notes: args.notes || 'Published via GTM Manager skill'
    }
  });

  const version = createRes.data.containerVersion;
  if (!version) {
    error('Failed to create version');
  }

  // Publish the version
  console.error('Publishing version...');
  const publishRes = await tagmanager.accounts.containers.versions.publish({
    path: version.path
  });

  output({
    success: true,
    containerVersionId: publishRes.data.containerVersion.containerVersionId,
    name: publishRes.data.containerVersion.name,
    path: publishRes.data.containerVersion.path
  });
}

main().catch(e => error(e.message));
