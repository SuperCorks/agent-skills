#!/usr/bin/env node
const { getClientFromArgs, parseArgs, output, error } = require('./gtm-lib');

const HELP = `
List all versions of a GTM container.

Usage:
  node list-versions.js --account <id> --container <id> --credentials <path> --token <path>

Options:
  -a, --account <id>    GTM account ID (required)
  -c, --container <id>  GTM container ID (required)
  --credentials <path>  Path to OAuth client secrets JSON
  --token <path>        Path to saved token
  --service-key <path>  Path to service account key (alternative)
  -h, --help            Show this help

Output:
  JSON array of versions with id, name, and publish date
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
  const containerPath = `accounts/${args.account}/containers/${args.container}`;
  
  const res = await tagmanager.accounts.containers.versions.list({
    parent: containerPath
  });
  
  const versions = (res.data.containerVersionHeader || []).map(v => ({
    containerVersionId: v.containerVersionId,
    name: v.name,
    numTags: v.numTags,
    numTriggers: v.numTriggers,
    numVariables: v.numVariables,
    path: v.path,
  }));

  output(versions);
}

main().catch(e => error(e.message));
