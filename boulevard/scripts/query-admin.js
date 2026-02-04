#!/usr/bin/env node
/**
 * Query the Boulevard Admin API
 * 
 * Usage:
 *   node scripts/query-admin.js \
 *     --env=sandbox \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --api-secret=YOUR_API_SECRET \
 *     --query='{ locations(first: 10) { edges { node { id name } } } }'
 */

const { parseArgs, validateRequired, printAdminHelp } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken } = require('../lib/auth');
const { executeGraphQL, hasErrors, formatErrors } = require('../lib/graphql');

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    printAdminHelp('scripts/query-admin.js');
    process.exit(0);
  }
  
  try {
    validateRequired(args, ['env', 'business-id', 'api-key', 'api-secret', 'query']);
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    printAdminHelp('scripts/query-admin.js');
    process.exit(1);
  }
  
  const env = args.env;
  const businessId = args['business-id'];
  const apiKey = args['api-key'];
  const apiSecret = args['api-secret'];
  const query = args.query;
  const verbose = args.verbose === true || args.verbose === 'true';
  
  let variables = {};
  if (args.variables) {
    try {
      variables = JSON.parse(args.variables);
    } catch (err) {
      console.error(`Error parsing --variables as JSON: ${err.message}`);
      process.exit(1);
    }
  }
  
  const url = getAdminUrl(env);
  const token = generateAdminToken(businessId, apiKey, apiSecret);
  
  if (verbose) {
    console.error(`[Admin API] URL: ${url}`);
    console.error(`[Admin API] Query: ${query.slice(0, 100)}${query.length > 100 ? '...' : ''}`);
  }
  
  const response = await executeGraphQL(url, token, query, variables, { verbose });
  
  if (hasErrors(response)) {
    console.error(`GraphQL errors:\n${formatErrors(response.errors)}`);
    // Still output the response (may have partial data)
  }
  
  // Output JSON to stdout
  console.log(JSON.stringify(response.data, null, 2));
  
  if (hasErrors(response)) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
