#!/usr/bin/env node
/**
 * List all services from Boulevard Admin API
 * 
 * Usage:
 *   node scripts/list-services.js \
 *     --env=sandbox \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --api-secret=YOUR_API_SECRET
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken } = require('../lib/auth');
const { fetchAllPages } = require('../lib/pagination');

const LIST_SERVICES_QUERY = `
  query ListServices($first: Int!, $after: String) {
    services(first: $first, after: $after) {
      edges {
        node {
          id
          active
          addon
          name
          description
          externalId
          categoryId
          category {
            id
            name
          }
          defaultDuration
          defaultPrice
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
Usage: node scripts/list-services.js [options]

List all services from Boulevard Admin API

Required:
  --env           Environment: 'sandbox' or 'prod'
  --business-id   Boulevard Business ID (UUID)
  --api-key       API application key
  --api-secret    API application secret (base64-encoded)

Optional:
  --verbose       Show pagination progress
  --help          Show this help message

Output:
  JSON array of services with:
    - id, name, description, externalId
    - categoryId, category { id, name }
    - defaultDuration (minutes), defaultPrice (cents) [read-only]
    - createdAt, updatedAt
`);
    process.exit(0);
  }
  
  try {
    validateRequired(args, ['env', 'business-id', 'api-key', 'api-secret']);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
  
  const env = args.env;
  const businessId = args['business-id'];
  const apiKey = args['api-key'];
  const apiSecret = args['api-secret'];
  const verbose = args.verbose === true || args.verbose === 'true';
  
  const url = getAdminUrl(env);
  const token = generateAdminToken(businessId, apiKey, apiSecret);
  
  if (verbose) {
    console.error(`[List Services] Fetching from ${env} environment...`);
  }
  
  const services = await fetchAllPages({
    url,
    authToken: token,
    queryTemplate: LIST_SERVICES_QUERY,
    connectionPath: 'services',
    options: { verbose },
  });
  
  if (verbose) {
    console.error(`[List Services] Found ${services.length} services`);
  }
  
  // Sort by category name, then service name for consistent output
  services.sort((a, b) => {
    const catCompare = (a.category?.name || '').localeCompare(b.category?.name || '');
    if (catCompare !== 0) return catCompare;
    return a.name.localeCompare(b.name);
  });
  
  console.log(JSON.stringify(services, null, 2));
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
