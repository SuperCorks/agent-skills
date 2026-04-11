const ERROR_CODES = {
  VIDAPP_AUTH_MISSING: {
    code: 'VIDAPP_AUTH_MISSING',
    message: 'VIDAPP_API_KEY environment variable is not set',
    remediation: 'Set VIDAPP_API_KEY before running the script',
  },
  VIDAPP_APP_ID_MISSING: {
    code: 'VIDAPP_APP_ID_MISSING',
    message: 'VidApp app id is required',
    remediation: 'Provide --app-id <value> or set VIDAPP_APP_ID',
  },
  VIDAPP_AUTH_INVALID: {
    code: 'VIDAPP_AUTH_INVALID',
    message: 'VidApp authentication failed',
    remediation: 'Verify the API key and confirm it still has access to the target app',
  },
  VIDAPP_ARGS_INVALID: {
    code: 'VIDAPP_ARGS_INVALID',
    message: 'Invalid or missing CLI arguments',
    remediation: 'Run the script with --help and provide the required flags',
  },
  VIDAPP_NOT_FOUND: {
    code: 'VIDAPP_NOT_FOUND',
    message: 'The requested VidApp resource was not found',
    remediation: 'Verify the path, identifiers, and selected app id',
  },
  VIDAPP_RATE_LIMITED: {
    code: 'VIDAPP_RATE_LIMITED',
    message: 'VidApp API rate limit exceeded',
    remediation: 'Retry with backoff and reduce request volume',
  },
  VIDAPP_API_ERROR: {
    code: 'VIDAPP_API_ERROR',
    message: 'VidApp API returned an error',
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