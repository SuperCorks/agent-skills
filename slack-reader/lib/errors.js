/**
 * Error handling for Slack Reader skill
 */

const ERROR_CODES = {
  SLACK_SDK_MISSING: {
    code: 'SLACK_SDK_MISSING',
    message: '@slack/web-api package is not installed',
    remediation: 'Run: npm install @slack/web-api',
  },
  SLACK_AUTH_MISSING: {
    code: 'SLACK_AUTH_MISSING',
    message: 'No Slack workspace tokens configured',
    remediation: 'Set SLACK_WORKSPACES (JSON: {"alias": "xoxb-..."}) or SLACK_BOT_TOKEN for single workspace',
  },
  SLACK_WORKSPACES_INVALID: {
    code: 'SLACK_WORKSPACES_INVALID',
    message: 'SLACK_WORKSPACES environment variable is invalid',
    remediation: 'SLACK_WORKSPACES must be valid JSON: {"personal": "xoxb-...", "company": "xoxb-..."}',
  },
  SLACK_WORKSPACE_AMBIGUOUS: {
    code: 'SLACK_WORKSPACE_AMBIGUOUS',
    message: 'Multiple workspaces configured but cannot determine which to use',
    remediation: 'Specify --workspace flag with one of the available workspace aliases',
  },
  SLACK_WORKSPACE_NOT_FOUND: {
    code: 'SLACK_WORKSPACE_NOT_FOUND',
    message: 'Specified workspace not found in SLACK_WORKSPACES',
    remediation: 'Check workspace alias matches a key in SLACK_WORKSPACES',
  },
  SLACK_AUTH_INVALID: {
    code: 'SLACK_AUTH_INVALID',
    message: 'Slack authentication failed - token is invalid or expired',
    remediation: 'Verify your SLACK_BOT_TOKEN is correct and the app is installed to the workspace',
  },
  SLACK_URL_INVALID: {
    code: 'SLACK_URL_INVALID',
    message: 'Invalid Slack message URL format',
    remediation: 'Provide a valid Slack message permalink (e.g., https://workspace.slack.com/archives/C123/p1234567890123456)',
  },
  SLACK_CHANNEL_NOT_FOUND: {
    code: 'SLACK_CHANNEL_NOT_FOUND',
    message: 'Channel not found or bot lacks access',
    remediation: 'Ensure the bot is invited to the channel and has the required scopes (channels:history, groups:history, im:history, mpim:history)',
  },
  SLACK_MESSAGE_NOT_FOUND: {
    code: 'SLACK_MESSAGE_NOT_FOUND',
    message: 'Message not found at the specified timestamp',
    remediation: 'Verify the message URL is correct and the message has not been deleted',
  },
  SLACK_PERMISSION_DENIED: {
    code: 'SLACK_PERMISSION_DENIED',
    message: 'Slack token lacks permission to access this resource',
    remediation: 'Add the required read scopes to the Slack app, reinstall it, and verify the token can access the conversation',
  },
  SLACK_ARGUMENT_INVALID: {
    code: 'SLACK_ARGUMENT_INVALID',
    message: 'Invalid command-line argument',
    remediation: 'Run the script with --help and correct the supplied option',
  },
  SLACK_USER_TOKEN_REQUIRED: {
    code: 'SLACK_USER_TOKEN_REQUIRED',
    message: 'This Slack operation requires a user OAuth token',
    remediation: 'Configure an xoxp- token with search:read for this workspace',
  },
  SLACK_FILE_DOWNLOAD_FAILED: {
    code: 'SLACK_FILE_DOWNLOAD_FAILED',
    message: 'Failed to download a Slack file',
    remediation: 'Verify the token has files:read and can access the message and file',
  },
  SLACK_RATE_LIMITED: {
    code: 'SLACK_RATE_LIMITED',
    message: 'Slack API rate limit exceeded',
    remediation: 'Wait a moment and retry the request. Consider adding retry logic with exponential backoff.',
  },
  SLACK_API_ERROR: {
    code: 'SLACK_API_ERROR',
    message: 'Slack API returned an error',
    remediation: 'Check the error details and Slack API documentation',
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
