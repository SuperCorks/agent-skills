#!/usr/bin/env node
/**
 * List all service categories from Boulevard Admin API
 * 
 * Usage:
 *   node scripts/list-service-categories.js \
 *     --env=sandbox \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --api-secret=YOUR_API_SECRET
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken } = require('../lib/auth');
const { fetchAllPages } = require('../lib/pagination');

const LIST_CATEGORIES_QUERY = `
  query ListServiceCategories($first: Int!, $after: String) {
    serviceCategories(first: $first, after: $after) {
      edges {
        node {
          id
          name
          active
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
Usage: node scripts/list-service-categories.js [options]

List all service categories from Boulevard Admin API

Required:
  --env           Environment: 'sandbox' or 'prod'
  --business-id   Boulevard Business ID (UUID)
  --api-key       API application key
  --api-secret    API application secret (base64-encoded)

Optional:
  --verbose       Show pagination progress
  --help          Show this help message

Output:
  JSON array of service categories with id, name, active, createdAt, updatedAt
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
    console.error(`[List Categories] Fetching from ${env} environment...`);
  }
  
  const categories = await fetchAllPages({
    url,
    authToken: token,
    queryTemplate: LIST_CATEGORIES_QUERY,
    connectionPath: 'serviceCategories',
    options: { verbose },
  });
  
  if (verbose) {
    console.error(`[List Categories] Found ${categories.length} categories`);
  }
  
  // Sort by name for consistent output
  categories.sort((a, b) => a.name.localeCompare(b.name));
  
  console.log(JSON.stringify(categories, null, 2));
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
