#!/usr/bin/env node
/**
 * Find a Boulevard client by email using the Admin API
 * 
 * Usage:
 *   node scripts/find-client.js \
 *     --env=sandbox \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --api-secret=YOUR_API_SECRET \
 *     --email=client@example.com
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken } = require('../lib/auth');
const { executeGraphQL, hasErrors, formatErrors } = require('../lib/graphql');

const FIND_CLIENT_QUERY = `
  query FindClientByEmail($emails: [String!]!) {
    clients(emails: $emails, first: 10) {
      edges {
        node {
          id
          firstName
          lastName
          email
          mobilePhone
          externalId
          createdAt
        }
      }
    }
  }
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
Usage: node scripts/find-client.js [options]

Find a Boulevard client by email address using the Admin API

Required:
  --env           Environment: 'sandbox' or 'prod'
  --business-id   Boulevard Business ID (UUID)
  --api-key       API application key
  --api-secret    API application secret (base64-encoded)
  --email         Client email address to search for

Optional:
  --verbose       Show debug info
  --help          Show this help message

Example:
  node scripts/find-client.js \\
    --env=sandbox \\
    --business-id=abc123 \\
    --api-key=xyz789 \\
    --api-secret=base64secret \\
    --email=client@example.com
`);
    process.exit(0);
  }
  
  try {
    validateRequired(args, ['env', 'business-id', 'api-key', 'api-secret', 'email']);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
  
  const env = args.env;
  const businessId = args['business-id'];
  const apiKey = args['api-key'];
  const apiSecret = args['api-secret'];
  const email = args.email;
  const verbose = args.verbose === true || args.verbose === 'true';
  
  const url = getAdminUrl(env);
  const token = generateAdminToken(businessId, apiKey, apiSecret);
  
  if (verbose) {
    console.error(`[Find Client] Searching for email: ${email}`);
  }
  
  const response = await executeGraphQL(url, token, FIND_CLIENT_QUERY, { emails: [email] }, { verbose });
  
  if (hasErrors(response)) {
    console.error(`GraphQL errors:\n${formatErrors(response.errors)}`);
    process.exit(1);
  }
  
  const clients = response.data?.clients?.edges?.map(e => e.node) || [];
  
  if (clients.length === 0) {
    console.error(`No client found with email: ${email}`);
    process.exit(1);
  }
  
  // Output all matching clients
  console.log(JSON.stringify(clients, null, 2));
  
  // Also output just the first client ID for easy piping
  if (verbose && clients.length > 0) {
    console.error(`\nFirst matching client ID: ${clients[0].id}`);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
