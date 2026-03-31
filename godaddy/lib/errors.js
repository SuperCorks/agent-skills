const ERROR_CODES = {
  GODADDY_AUTH_MISSING: {
    code: 'GODADDY_AUTH_MISSING',
    message: 'GODADDY_ACCOUNTS environment variable is not set',
    remediation: 'Set GODADDY_ACCOUNTS as JSON with key and secret per account',
  },
  GODADDY_AUTH_INVALID: {
    code: 'GODADDY_AUTH_INVALID',
    message: 'GoDaddy authentication failed',
    remediation: 'Verify the GoDaddy API key, secret, and environment URL',
  },
  GODADDY_ACCOUNT_AMBIGUOUS: {
    code: 'GODADDY_ACCOUNT_AMBIGUOUS',
    message: 'Multiple GoDaddy accounts are configured but none was selected',
    remediation: 'Use --account <name> to choose an account',
  },
  GODADDY_ACCOUNT_NOT_FOUND: {
    code: 'GODADDY_ACCOUNT_NOT_FOUND',
    message: 'Specified GoDaddy account not found in configuration',
    remediation: 'Check GODADDY_ACCOUNTS for valid account names',
  },
  GODADDY_ARGS_INVALID: {
    code: 'GODADDY_ARGS_INVALID',
    message: 'Invalid or missing CLI arguments',
    remediation: 'Run the command with --help and provide the required flags',
  },
  GODADDY_NOT_FOUND: {
    code: 'GODADDY_NOT_FOUND',
    message: 'Requested GoDaddy resource was not found',
    remediation: 'Verify the domain, record name, and selected account',
  },
  GODADDY_WRITE_CONFIRM_REQUIRED: {
    code: 'GODADDY_WRITE_CONFIRM_REQUIRED',
    message: 'This write operation requires explicit confirmation',
    remediation: 'Re-run the command with --confirm after reviewing the preview output',
  },
  GODADDY_RATE_LIMITED: {
    code: 'GODADDY_RATE_LIMITED',
    message: 'GoDaddy API rate limit exceeded',
    remediation: 'Retry after a short backoff',
  },
  GODADDY_API_ERROR: {
    code: 'GODADDY_API_ERROR',
    message: 'GoDaddy API returned an error',
    remediation: 'Check the response details and request parameters',
  },
};

class SkillError extends Error {
  constructor(code, details) {
    const errorDef = ERROR_CODES[code];
    if (!errorDef) {
      super(`Unknown error code: ${code}`);
      this.code = 'UNKNOWN_ERROR';
      this.remediation = 'Check the error details';
    } else {
      super(details ? `${errorDef.message}: ${details}` : errorDef.message);
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
