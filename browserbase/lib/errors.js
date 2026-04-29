const ERROR_CODES = {
  BROWSERBASE_AUTH_MISSING: {
    code: 'BROWSERBASE_AUTH_MISSING',
    message: 'Browserbase credentials are not configured',
    remediation: 'Set BROWSERBASE_ACCOUNTS or set BROWSERBASE_API_KEY for single-account fallback',
  },
  BROWSERBASE_AUTH_INVALID: {
    code: 'BROWSERBASE_AUTH_INVALID',
    message: 'Browserbase account configuration is invalid',
    remediation: 'Verify BROWSERBASE_ACCOUNTS is valid JSON with apiKey per account',
  },
  BROWSERBASE_ACCOUNT_AMBIGUOUS: {
    code: 'BROWSERBASE_ACCOUNT_AMBIGUOUS',
    message: 'Multiple Browserbase accounts are configured but none was selected',
    remediation: 'Use --account <name> to choose an account',
  },
  BROWSERBASE_ACCOUNT_NOT_FOUND: {
    code: 'BROWSERBASE_ACCOUNT_NOT_FOUND',
    message: 'Specified Browserbase account was not found',
    remediation: 'Run node scripts/list-accounts.js and choose an available account alias',
  },
  BROWSERBASE_PROJECT_ID_MISSING: {
    code: 'BROWSERBASE_PROJECT_ID_MISSING',
    message: 'Browserbase project id is required for this workflow',
    remediation: 'Add projectId to the selected BROWSERBASE_ACCOUNTS entry or set BROWSERBASE_PROJECT_ID',
  },
  BROWSERBASE_CLI_MISSING: {
    code: 'BROWSERBASE_CLI_MISSING',
    message: 'Required Browserbase CLI executable was not found',
    remediation: 'Install @browserbasehq/cli for bb or @browserbasehq/browse-cli for browse',
  },
  BROWSERBASE_COMMAND_FAILED: {
    code: 'BROWSERBASE_COMMAND_FAILED',
    message: 'Browserbase command failed',
    remediation: 'Check the command output, selected account, and Browserbase CLI flags',
  },
  BROWSERBASE_ARGS_INVALID: {
    code: 'BROWSERBASE_ARGS_INVALID',
    message: 'Invalid or missing CLI arguments',
    remediation: 'Run the script with --help and provide required flags',
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