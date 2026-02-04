/**
 * CLI argument parsing utilities
 * 
 * Parses command-line flags in the format: --flag=value or --flag value
 */

/**
 * Parse command-line arguments
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Object<string, string | boolean>}
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      const withoutDashes = arg.slice(2);
      
      // Handle --flag=value
      if (withoutDashes.includes('=')) {
        const [key, ...valueParts] = withoutDashes.split('=');
        args[key] = valueParts.join('=');
      }
      // Handle --flag value or --flag (boolean)
      else {
        const key = withoutDashes;
        const nextArg = argv[i + 1];
        
        if (nextArg && !nextArg.startsWith('--')) {
          args[key] = nextArg;
          i++; // Skip next arg since we consumed it
        } else {
          args[key] = true;
        }
      }
    }
  }
  
  return args;
}

/**
 * Validate that required arguments are present
 * @param {Object} args - Parsed arguments
 * @param {string[]} required - List of required argument names
 * @throws {Error} If any required argument is missing
 */
function validateRequired(args, required) {
  const missing = required.filter(name => !args[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required arguments: ${missing.map(n => `--${n}`).join(', ')}`);
  }
}

/**
 * Print help message for admin API scripts
 * @param {string} scriptName
 * @param {Object} options
 * @param {string[]} [options.extraFlags=[]]
 * @param {string} [options.description]
 */
function printAdminHelp(scriptName, { extraFlags = [], description } = {}) {
  console.log(`
Usage: node ${scriptName} [options]

${description || 'Query the Boulevard Admin API'}

Required:
  --env           Environment: 'sandbox' or 'prod'
  --business-id   Boulevard Business ID (UUID)
  --api-key       API application key
  --api-secret    API application secret (base64-encoded)
  --query         GraphQL query or mutation

Optional:
  --variables     JSON-encoded query variables
  --verbose       Show rate limit and debug info
  --help          Show this help message
${extraFlags.map(f => `  ${f}`).join('\n')}

Example:
  node ${scriptName} \\
    --env=sandbox \\
    --business-id=abc123 \\
    --api-key=xyz789 \\
    --api-secret=base64secret \\
    --query='{ locations(first: 10) { edges { node { id name } } } }'
`);
}

/**
 * Print help message for client API scripts
 * @param {string} scriptName
 * @param {Object} options
 * @param {boolean} [options.isKnown=false]
 * @param {string[]} [options.extraFlags=[]]
 */
function printClientHelp(scriptName, { isKnown = false, extraFlags = [] } = {}) {
  const type = isKnown ? 'Known (Authenticated)' : 'Public (Guest)';
  const secretRequired = isKnown ? 'Required' : 'Not needed';
  const clientIdNote = isKnown ? `  --client-id     Client ID (UUID) - Required for authenticated access` : '';
  
  console.log(`
Usage: node ${scriptName} [options]

Query the Boulevard ${type} Client API

Required:
  --env           Environment: 'sandbox' or 'prod'
  --business-id   Boulevard Business ID (UUID)
  --api-key       API application key
  --query         GraphQL query or mutation
${clientIdNote}

Optional:
${isKnown ? '' : '  --api-secret    API secret - ' + secretRequired + '\n'}  --variables     JSON-encoded query variables
  --verbose       Show rate limit and debug info
  --help          Show this help message
${extraFlags.map(f => `  ${f}`).join('\n')}
`);
}

module.exports = {
  parseArgs,
  validateRequired,
  printAdminHelp,
  printClientHelp,
};
