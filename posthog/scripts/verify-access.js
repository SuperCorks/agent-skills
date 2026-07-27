#!/usr/bin/env node

const {
  getConfiguredAccounts,
  resolveAccount,
  resolveProjectId,
} = require('../lib/accounts');
const { parseArgs, printHelp, outputJson, outputError } = require('../lib/cli');
const { createClient, getProject, listProjects } = require('../lib/client');
const {
  buildMetadata,
  normalizeProjectList,
  summarizeProject,
} = require('../lib/normalizer');

const HELP = `
Verify a PostHog personal API key and optional project with a read-only request.

Usage:
  node scripts/verify-access.js [options]

Options:
  --account <name>  Account alias from POSTHOG_ACCOUNTS
  --project <id>    Override the account's default project
  --host <url>      Override the account's private API host
  --help            Show this help
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp(HELP);
    return;
  }

  const account = resolveAccount(getConfiguredAccounts(), args.account);
  const projectId = resolveProjectId(account, args.project, false);
  const client = createClient(account, { host: args.host });

  if (projectId) {
    const path = `/api/projects/${encodeURIComponent(projectId)}/`;
    const project = await getProject(client, projectId);
    outputJson({
      metadata: buildMetadata(account.name, client, { projectId, path }),
      verification: {
        ok: true,
        mode: 'project',
        project: summarizeProject(project),
      },
    });
    return;
  }

  const response = await listProjects(client, { limit: 5, offset: 0 });
  const projects = normalizeProjectList(response);
  outputJson({
    metadata: buildMetadata(account.name, client, { path: '/api/projects/' }),
    verification: {
      ok: true,
      mode: 'account',
      accessibleProjectCount: projects.count,
      sampleProjects: projects.projects,
    },
  });
}

main().catch(outputError);
