/**
 * Boulevard GraphQL client with rate-limit retry support
 * 
 * Rate limits per Boulevard docs:
 * - 10,000 cost points bucket
 * - 50 points/second leak rate
 * - Error message format: "API limit exceeded. Query cost is X and you have Y points available. Please wait Zms and try again."
 */

/**
 * @typedef {Object} GraphQLResponse
 * @property {Object} [data] - Query result data
 * @property {Array<{message: string, path?: string[], locations?: Array<{line: number, column: number}>}>} [errors] - GraphQL errors
 * @property {string} [queryComplexity] - x-query-complexity header value if present
 */

/**
 * Execute a GraphQL query/mutation against Boulevard API
 * 
 * @param {string} url - Full API endpoint URL
 * @param {string} authToken - Base64-encoded Basic Auth credentials
 * @param {string} query - GraphQL query or mutation
 * @param {Object} [variables] - Query variables
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3] - Max retries on rate limit
 * @param {boolean} [options.verbose=false] - Log rate limit info
 * @returns {Promise<GraphQLResponse>}
 */
async function executeGraphQL(url, authToken, query, variables = {}, options = {}) {
  const { maxRetries = 3, verbose = false } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      
      // Capture query complexity header for debugging
      const queryComplexity = response.headers.get('x-query-complexity');
      if (verbose && queryComplexity) {
        console.error(`[Boulevard] Query complexity: ${queryComplexity}`);
      }
      
      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = null;
      }

      if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null;
        const bodySnippet = responseText ? responseText.slice(0, 500) : '';

        const error = new Error(
          `HTTP ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet}` : ''}`
        );
        error.status = response.status;
        error.retryable = response.status === 429 || response.status >= 500;
        error.retryAfterMs = retryAfterMs;
        throw error;
      }

      if (!result || typeof result !== 'object') {
        const error = new Error('Invalid JSON response from server');
        error.retryable = true;
        throw error;
      }
      
      // Check for rate limit errors
      const rateLimitError = findRateLimitError(result.errors);
      if (rateLimitError) {
        const waitMs = parseWaitTime(rateLimitError.message);
        if (waitMs && attempt < maxRetries) {
          if (verbose) {
            console.error(`[Boulevard] Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
          }
          await sleep(waitMs);
          continue;
        }
      }
      
      return {
        ...result,
        queryComplexity,
      };
    } catch (err) {
      lastError = err;

      const isRetryable = err && (err.retryable === true || err.name === 'TypeError');
      if (!isRetryable) {
        throw err;
      }

      // Retryable errors: apply backoff or Retry-After
      if (attempt < maxRetries) {
        const retryAfterMs = err.retryAfterMs;
        const backoff = retryAfterMs != null ? retryAfterMs : Math.min(1000 * Math.pow(2, attempt), 10000);
        if (verbose) {
          console.error(`[Boulevard] Retryable error: ${err.message}. Retrying in ${backoff}ms...`);
        }
        await sleep(backoff);
        continue;
      }
    }
  }
  
  throw lastError || new Error('GraphQL request failed after retries');
}

/**
 * Find a rate limit error in the errors array
 * @param {Array<{message: string}>} [errors]
 * @returns {{message: string} | undefined}
 */
function findRateLimitError(errors) {
  if (!errors || !Array.isArray(errors)) return undefined;
  return errors.find(e => e.message && e.message.includes('API limit exceeded'));
}

/**
 * Parse wait time from Boulevard rate limit error message
 * e.g., "...Please wait 400ms and try again." -> 400
 * 
 * @param {string} message
 * @returns {number | null} Wait time in milliseconds
 */
function parseWaitTime(message) {
  const match = message.match(/wait\s+(\d+)ms/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Fallback: if we can't parse, wait 500ms
  return 500;
}

/**
 * Sleep for the specified duration
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the response has errors
 * @param {GraphQLResponse} response
 * @returns {boolean}
 */
function hasErrors(response) {
  return response.errors && response.errors.length > 0;
}

/**
 * Format GraphQL errors for display
 * @param {Array<{message: string, path?: string[]}>} errors
 * @returns {string}
 */
function formatErrors(errors) {
  if (!errors || errors.length === 0) return '';
  return errors.map(e => {
    const path = e.path ? ` at ${e.path.join('.')}` : '';
    return `${e.message}${path}`;
  }).join('\n');
}

module.exports = {
  executeGraphQL,
  hasErrors,
  formatErrors,
  sleep,
};
