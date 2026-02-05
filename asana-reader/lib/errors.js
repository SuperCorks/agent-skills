/**
 * Error handling for Asana Reader skill
 */

const ERROR_CODES = {
  ASANA_SDK_MISSING: {
    code: 'ASANA_SDK_MISSING',
    message: 'asana package is not installed',
    remediation: 'Run: npm install asana',
  },
  ASANA_AUTH_MISSING: {
    code: 'ASANA_AUTH_MISSING',
    message: 'ASANA_ACCOUNTS environment variable is not set',
    remediation: 'Set ASANA_ACCOUNTS as JSON: {"account_name": "0/your_pat_token"}',
  },
  ASANA_AUTH_INVALID: {
    code: 'ASANA_AUTH_INVALID',
    message: 'Asana authentication failed - token is invalid or expired',
    remediation: 'Verify your Personal Access Token is correct and has not expired',
  },
  ASANA_ACCOUNT_AMBIGUOUS: {
    code: 'ASANA_ACCOUNT_AMBIGUOUS',
    message: 'Multiple Asana accounts configured but none specified',
    remediation: 'Use --account <name> to specify which account to use',
  },
  ASANA_ACCOUNT_NOT_FOUND: {
    code: 'ASANA_ACCOUNT_NOT_FOUND',
    message: 'Specified Asana account not found in configuration',
    remediation: 'Check ASANA_ACCOUNTS for available account names',
  },
  ASANA_URL_INVALID: {
    code: 'ASANA_URL_INVALID',
    message: 'Invalid Asana task URL format',
    remediation: 'Provide a valid Asana task URL (e.g., https://app.asana.com/0/PROJECT/TASK)',
  },
  ASANA_TASK_NOT_FOUND: {
    code: 'ASANA_TASK_NOT_FOUND',
    message: 'Task not found or you lack access',
    remediation: 'Verify the task exists and you have permission to view it',
  },
  ASANA_SEARCH_AMBIGUOUS: {
    code: 'ASANA_SEARCH_AMBIGUOUS',
    message: 'Search returned multiple matching tasks',
    remediation: 'Refine your search query or use --id or --url to specify the exact task',
  },
  ASANA_SEARCH_NO_RESULTS: {
    code: 'ASANA_SEARCH_NO_RESULTS',
    message: 'No tasks found matching the search query',
    remediation: 'Try a different search term or verify the task exists in the specified workspace',
  },
  ASANA_WORKSPACE_REQUIRED: {
    code: 'ASANA_WORKSPACE_REQUIRED',
    message: 'Workspace GID is required for search',
    remediation: 'Use --workspace <gid> to specify the workspace for searching',
  },
  ASANA_RATE_LIMITED: {
    code: 'ASANA_RATE_LIMITED',
    message: 'Asana API rate limit exceeded',
    remediation: 'Wait a moment and retry the request. Asana allows 1500 requests per minute.',
  },
  ASANA_API_ERROR: {
    code: 'ASANA_API_ERROR',
    message: 'Asana API returned an error',
    remediation: 'Check the error details and Asana API documentation',
  },
};

class SkillError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code - Error code from ERROR_CODES
   * @param {string} [details] - Additional error details
   */
  constructor(code, details) {
    const errorDef = ERROR_CODES[code];
    if (!errorDef) {
      super(`Unknown error code: ${code}`);
      this.code = 'UNKNOWN_ERROR';
      this.remediation = 'Check the error details';
    } else {
      const message = details ? `${errorDef.message}: ${details}` : errorDef.message;
      super(message);
      this.code = errorDef.code;
      this.remediation = errorDef.remediation;
    }
    this.name = 'SkillError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      remediation: this.remediation,
    };
  }
}

module.exports = {
  ERROR_CODES,
  SkillError,
};
