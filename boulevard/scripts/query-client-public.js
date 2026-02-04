#!/usr/bin/env node
/**
 * Query the Boulevard Public (Guest) Client API
 * 
 * Usage:
 *   node scripts/query-client-public.js \
 *     --env=sandbox \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --query='{ business { id name } }'
 */

const { parseArgs, validateRequired, printClientHelp } = require('../lib/cli');
const { getClientUrl } = require('../lib/endpoints');
const { generateGuestClientToken } = require('../lib/auth');
const { executeGraphQL, hasErrors, formatErrors } = require('../lib/graphql');

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    printClientHelp('scripts/query-client-public.js', { isKnown: false });
    process.exit(0);
  }
  
  try {
    validateRequired(args, ['env', 'business-id', 'api-key', 'query']);
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    printClientHelp('scripts/query-client-public.js', { isKnown: false });
    process.exit(1);
  }
  
  const env = args.env;
  const businessId = args['business-id'];
  const apiKey = args['api-key'];
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
  
  const url = getClientUrl(env, businessId);
  const token = generateGuestClientToken(apiKey);
  
  if (verbose) {
    console.error(`[Public Client API] URL: ${url}`);
    console.error(`[Public Client API] Query: ${query.slice(0, 100)}${query.length > 100 ? '...' : ''}`);
  }
  
  const response = await executeGraphQL(url, token, query, variables, { verbose });
  
  if (hasErrors(response)) {
    console.error(`GraphQL errors:\n${formatErrors(response.errors)}`);
  }
  
  console.log(JSON.stringify(response.data, null, 2));
  
  if (hasErrors(response)) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
