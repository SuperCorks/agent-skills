const ERROR_CODES = {
  VIMEO_OTT_AUTH_MISSING: {
    code: 'VIMEO_OTT_AUTH_MISSING',
    message: 'VIMEO_OTT_ACCOUNTS environment variable is not set',
    remediation: 'Set VIMEO_OTT_ACCOUNTS as JSON: {"prod":"your_api_key"}',
  },
  VIMEO_OTT_AUTH_INVALID: {
    code: 'VIMEO_OTT_AUTH_INVALID',
    message: 'Vimeo OTT authentication failed',
    remediation: 'Verify the API key and confirm the site owner still matches the key owner',
  },
  VIMEO_OTT_ACCOUNT_AMBIGUOUS: {
    code: 'VIMEO_OTT_ACCOUNT_AMBIGUOUS',
    message: 'Multiple Vimeo OTT accounts are configured but none was selected',
    remediation: 'Use --account <name> to choose an account alias',
  },
  VIMEO_OTT_ACCOUNT_NOT_FOUND: {
    code: 'VIMEO_OTT_ACCOUNT_NOT_FOUND',
    message: 'Specified Vimeo OTT account was not found in configuration',
    remediation: 'Check VIMEO_OTT_ACCOUNTS for valid aliases',
  },
  VIMEO_OTT_ARGS_INVALID: {
    code: 'VIMEO_OTT_ARGS_INVALID',
    message: 'Invalid or missing CLI arguments',
    remediation: 'Run the script with --help and provide the required flags',
  },
  VIMEO_OTT_NOT_FOUND: {
    code: 'VIMEO_OTT_NOT_FOUND',
    message: 'The requested Vimeo OTT resource was not found',
    remediation: 'Verify the resource ID, href, query parameters, and selected account',
  },
  VIMEO_OTT_RATE_LIMITED: {
    code: 'VIMEO_OTT_RATE_LIMITED',
    message: 'Vimeo OTT API rate limit exceeded',
    remediation: 'Retry with backoff and reduce request volume',
  },
  VIMEO_OTT_API_ERROR: {
    code: 'VIMEO_OTT_API_ERROR',
    message: 'Vimeo OTT API returned an error',
    remediation: 'Check the error details and request parameters',
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