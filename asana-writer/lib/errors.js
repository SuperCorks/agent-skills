'use strict';

const DEFINITIONS = {
  ASANA_SDK_MISSING: ['The asana package is not installed', 'Run npm install in ~/.agents/skills/asana-writer'],
  ASANA_AUTH_MISSING: ['ASANA_ACCOUNTS is not configured', 'Set ASANA_ACCOUNTS to a JSON object of alias-to-PAT mappings'],
  ASANA_AUTH_INVALID: ['Asana authentication failed', 'Check that the selected Personal Access Token is valid'],
  ASANA_ACCOUNT_AMBIGUOUS: ['Multiple Asana accounts are configured', 'Pass --account with an exact configured alias'],
  ASANA_ACCOUNT_NOT_FOUND: ['The requested Asana account alias is not configured', 'Run list-accounts.js and select an available alias'],
  ASANA_ARGUMENT_INVALID: ['Invalid command arguments', 'Run the command with --help and correct the arguments'],
  ASANA_URL_INVALID: ['Invalid Asana task URL', 'Use an app.asana.com task URL or pass --id'],
  ASANA_PERMISSION_DENIED: ['Asana denied the requested operation', 'Verify the account has access and the required API scopes'],
  ASANA_PREMIUM_REQUIRED: ['The operation requires an unavailable Asana feature', 'Check the workspace plan and feature availability'],
  ASANA_NOT_FOUND: ['The requested Asana resource was not found', 'Verify the GID and account permissions'],
  ASANA_DUPLICATE_FOUND: ['An exact-name duplicate already exists', 'Use the existing resource or pass --allow-duplicate intentionally'],
  ASANA_RATE_LIMITED: ['Asana rate-limited the request', 'Wait for the reported retry interval, then re-read before retrying a write'],
  ASANA_WRITE_UNCERTAIN: ['The Asana write may have succeeded but its response was uncertain', 'Re-read the destination before attempting the write again'],
  ASANA_API_ERROR: ['Asana returned an API error', 'Inspect the details and verify the request against the Asana API documentation'],
};

class SkillError extends Error {
  constructor(code, details, metadata = {}) {
    const [message, remediation] = DEFINITIONS[code] || ['Unknown Asana writer error', 'Inspect the error details'];
    super(details ? `${message}: ${details}` : message);
    this.name = 'SkillError';
    this.code = code in DEFINITIONS ? code : 'ASANA_API_ERROR';
    this.remediation = remediation;
    Object.assign(this, metadata);
  }

  toJSON() {
    const result = { code: this.code, message: this.message, remediation: this.remediation };
    for (const key of ['status', 'retryAfter', 'operation', 'outcomeUncertain']) {
      if (this[key] !== undefined) result[key] = this[key];
    }
    return result;
  }
}

function extractApiMessage(error) {
  const body = error?.response?.body || error?.value || error?.body;
  return body?.errors?.map((item) => item.message).filter(Boolean).join('; ')
    || body?.message || error?.message || 'Unknown API failure';
}

function mapAsanaError(error, { operation, write = false } = {}) {
  if (error instanceof SkillError) return error;
  const status = Number(error?.status || error?.statusCode || error?.response?.statusCode || error?.response?.status);
  const details = extractApiMessage(error);
  const retryAfter = error?.response?.headers?.['retry-after'] || error?.headers?.['retry-after'];
  const metadata = { status: Number.isFinite(status) ? status : undefined, operation };

  if (status === 401) return new SkillError('ASANA_AUTH_INVALID', details, metadata);
  if (status === 402) return new SkillError('ASANA_PREMIUM_REQUIRED', details, metadata);
  if (status === 403) return new SkillError('ASANA_PERMISSION_DENIED', details, metadata);
  if (status === 404) return new SkillError('ASANA_NOT_FOUND', details, metadata);
  if (status === 429) return new SkillError('ASANA_RATE_LIMITED', details, { ...metadata, retryAfter });
  if (write && (!status || status >= 500)) {
    return new SkillError('ASANA_WRITE_UNCERTAIN', details, { ...metadata, outcomeUncertain: true });
  }
  return new SkillError('ASANA_API_ERROR', details, metadata);
}

module.exports = { DEFINITIONS, SkillError, mapAsanaError };
