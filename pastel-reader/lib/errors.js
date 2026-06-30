const REMEDIATIONS = {
  PASTEL_AUTH_MISSING: 'Set PASTEL_ACCOUNTS, run node scripts/auth.js set --account <alias> --token <token>, or set PASTEL_API_TOKEN for one-off use.',
  PASTEL_AUTH_INVALID: 'Check that the token is current and has access to the requested Pastel workspace.',
  PASTEL_ACCOUNT_AMBIGUOUS: 'Use --account <alias> or set PASTEL_ACCOUNT to choose a Pastel account.',
  PASTEL_ACCOUNT_NOT_FOUND: 'Run node scripts/list-accounts.js and choose an available Pastel account alias.',
  PASTEL_ACCOUNT_INVALID: 'Use account aliases with letters, numbers, dots, underscores, or hyphens.',
  PASTEL_NOT_FOUND: 'Verify the id, path, or canvas name and confirm the token can access it.',
  PASTEL_RATE_LIMITED: 'Wait and retry with a smaller page size.',
  PASTEL_ARGS_INVALID: 'Check the command options and run with --help for usage.',
  PASTEL_URL_INVALID: 'Pass a Pastel URL such as https://usepastel.com/link/abc123 or https://usepastel.com/link/abc123/comment/123.',
  PASTEL_CANVAS_REQUIRED: 'Pass --canvas-url, --canvas-id, or a unique --canvas-name.',
  PASTEL_CANVAS_NOT_FOUND: 'List canvases first, then retry with --canvas-id.',
  PASTEL_CANVAS_AMBIGUOUS: 'Use --canvas-id, or refine --canvas-name to a unique match.',
  PASTEL_COMMENT_NOT_FOUND: 'Verify the comment id in the URL and confirm the token can access the canvas.',
  PASTEL_DATE_INVALID: 'Use an ISO date such as 2026-06-30 or 2026-06-30T12:00:00Z.',
  PASTEL_FORMAT_INVALID: 'Use --format json, markdown, or csv.',
  PASTEL_API_ERROR: 'Inspect the API error details and adjust the request.',
};

class SkillError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'SkillError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    const result = {
      code: this.code,
      message: this.message,
      remediation: REMEDIATIONS[this.code] || REMEDIATIONS.PASTEL_API_ERROR,
    };
    if (this.details !== null && this.details !== undefined) {
      result.details = this.details;
    }
    return result;
  }
}

module.exports = {
  SkillError,
  REMEDIATIONS,
};
