const ERROR_CODES = {
  POSTHOG_AUTH_MISSING: {
    code: 'POSTHOG_AUTH_MISSING',
    message: 'PostHog credentials are not configured',
    remediation: 'Set POSTHOG_ACCOUNTS or POSTHOG_PERSONAL_API_KEY',
  },
  POSTHOG_AUTH_INVALID: {
    code: 'POSTHOG_AUTH_INVALID',
    message: 'PostHog authentication failed',
    remediation: 'Verify the personal API key and private API host',
  },
  POSTHOG_ACCOUNTS_INVALID: {
    code: 'POSTHOG_ACCOUNTS_INVALID',
    message: 'POSTHOG_ACCOUNTS is invalid',
    remediation: 'Set it to a JSON object mapping aliases to credential objects',
  },
  POSTHOG_ACCOUNT_AMBIGUOUS: {
    code: 'POSTHOG_ACCOUNT_AMBIGUOUS',
    message: 'Multiple PostHog accounts are configured but none was selected',
    remediation: 'Use --account <name> to choose an account',
  },
  POSTHOG_ACCOUNT_NOT_FOUND: {
    code: 'POSTHOG_ACCOUNT_NOT_FOUND',
    message: 'Specified PostHog account was not found',
    remediation: 'Run list-accounts.js and choose a configured alias',
  },
  POSTHOG_PROJECT_REQUIRED: {
    code: 'POSTHOG_PROJECT_REQUIRED',
    message: 'A PostHog project ID is required',
    remediation: 'Configure projectId for the account or pass --project <id>',
  },
  POSTHOG_ARGS_INVALID: {
    code: 'POSTHOG_ARGS_INVALID',
    message: 'Invalid or missing command arguments',
    remediation: 'Run the command with --help and correct the arguments',
  },
  POSTHOG_PERMISSION_DENIED: {
    code: 'POSTHOG_PERMISSION_DENIED',
    message: 'PostHog denied access to the requested resource',
    remediation: 'Verify personal API key scopes and project membership',
  },
  POSTHOG_NOT_FOUND: {
    code: 'POSTHOG_NOT_FOUND',
    message: 'The requested PostHog resource was not found',
    remediation: 'Verify the selected account, project, route, and resource ID',
  },
  POSTHOG_RATE_LIMITED: {
    code: 'POSTHOG_RATE_LIMITED',
    message: 'PostHog rate limited the request',
    remediation: 'Narrow the request and retry after a short backoff',
  },
  POSTHOG_API_ERROR: {
    code: 'POSTHOG_API_ERROR',
    message: 'PostHog API returned an error',
    remediation: 'Inspect the HTTP details and current PostHog API documentation',
  },
};

class SkillError extends Error {
  constructor(code, details) {
    const definition = ERROR_CODES[code];

    if (!definition) {
      super(`Unknown error code: ${code}`);
      this.code = 'UNKNOWN_ERROR';
      this.remediation = 'Inspect the error details';
    } else {
      super(details ? `${definition.message}: ${details}` : definition.message);
      this.code = definition.code;
      this.remediation = definition.remediation;
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
