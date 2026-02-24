const ERROR_CODES = {
  ITERABLE_AUTH_MISSING: {
    code: 'ITERABLE_AUTH_MISSING',
    message: 'ITERABLE_ACCOUNTS environment variable is not set',
    remediation: 'Set ITERABLE_ACCOUNTS as JSON: {"prod":"your_api_key"}',
  },
  ITERABLE_AUTH_INVALID: {
    code: 'ITERABLE_AUTH_INVALID',
    message: 'Iterable authentication failed - API key is invalid or expired',
    remediation: 'Verify API key and project access in Iterable',
  },
  ITERABLE_ACCOUNT_AMBIGUOUS: {
    code: 'ITERABLE_ACCOUNT_AMBIGUOUS',
    message: 'Multiple Iterable accounts configured but none specified',
    remediation: 'Use --account <name> to choose an account',
  },
  ITERABLE_ACCOUNT_NOT_FOUND: {
    code: 'ITERABLE_ACCOUNT_NOT_FOUND',
    message: 'Specified Iterable account not found in configuration',
    remediation: 'Check ITERABLE_ACCOUNTS for valid account names',
  },
  ITERABLE_ARGS_INVALID: {
    code: 'ITERABLE_ARGS_INVALID',
    message: 'Invalid or missing CLI arguments',
    remediation: 'Run command with --help and provide required flags',
  },
  ITERABLE_NOT_FOUND: {
    code: 'ITERABLE_NOT_FOUND',
    message: 'Requested Iterable resource was not found',
    remediation: 'Verify identifiers and account selection',
  },
  ITERABLE_RATE_LIMITED: {
    code: 'ITERABLE_RATE_LIMITED',
    message: 'Iterable API rate limit exceeded',
    remediation: 'Retry with backoff',
  },
  ITERABLE_API_ERROR: {
    code: 'ITERABLE_API_ERROR',
    message: 'Iterable API returned an error',
    remediation: 'Check error details and request parameters',
  },
};

class SkillError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [details]
   */
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
