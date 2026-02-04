/**
 * Pagination utilities for Boulevard's Relay-style connections
 * 
 * Boulevard limits:
 * - Max 1,000 edges per connection query
 * - Max depth of 10
 * 
 * We use conservative page sizes (100) to stay well under limits.
 */

const { executeGraphQL, hasErrors, formatErrors } = require('./graphql');

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 100; // Safety limit to prevent infinite loops

/**
 * @typedef {Object} PaginationOptions
 * @property {number} [pageSize=100] - Number of items per page
 * @property {number} [maxPages=100] - Maximum pages to fetch
 * @property {boolean} [verbose=false] - Log progress
 */

/**
 * Fetch all items from a paginated connection
 * 
 * @param {Object} params
 * @param {string} params.url - GraphQL endpoint
 * @param {string} params.authToken - Auth token
 * @param {string} params.queryTemplate - Query with $first and $after variables, returning a connection with pageInfo
 * @param {string} params.connectionPath - Dot-separated path to connection in response (e.g., 'services' or 'business.locations')
 * @param {Object} [params.extraVariables={}] - Additional query variables
 * @param {PaginationOptions} [params.options={}]
 * @returns {Promise<Array<Object>>} All nodes from the connection
 */
async function fetchAllPages(params) {
  const {
    url,
    authToken,
    queryTemplate,
    connectionPath,
    extraVariables = {},
    options = {},
  } = params;
  
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = MAX_PAGES,
    verbose = false,
  } = options;
  
  const allNodes = [];
  let cursor = null;
  let pageCount = 0;
  
  while (pageCount < maxPages) {
    const variables = {
      ...extraVariables,
      first: pageSize,
      after: cursor,
    };
    
    const response = await executeGraphQL(url, authToken, queryTemplate, variables, { verbose });
    
    if (hasErrors(response)) {
      throw new Error(`GraphQL error: ${formatErrors(response.errors)}`);
    }
    
    const connection = getNestedValue(response.data, connectionPath);
    if (!connection) {
      throw new Error(`Connection not found at path: ${connectionPath}`);
    }
    
    const edges = connection.edges || [];
    for (const edge of edges) {
      if (edge && edge.node) {
        allNodes.push(edge.node);
      }
    }
    
    pageCount++;
    if (verbose) {
      console.error(`[Pagination] Page ${pageCount}: fetched ${edges.length} items (total: ${allNodes.length})`);
    }
    
    const pageInfo = connection.pageInfo;
    if (!pageInfo || !pageInfo.hasNextPage) {
      break;
    }
    
    cursor = pageInfo.endCursor;
  }
  
  if (pageCount >= maxPages) {
    console.error(`[Pagination] Warning: reached max pages limit (${maxPages}). Results may be incomplete.`);
  }
  
  return allNodes;
}

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj
 * @param {string} path - Dot-separated path (e.g., 'business.locations')
 * @returns {*}
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

module.exports = {
  fetchAllPages,
  getNestedValue,
  DEFAULT_PAGE_SIZE,
};
