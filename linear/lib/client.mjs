import { readFileSync } from "node:fs";

export class LinearError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details) {
  throw new LinearError(code, message, details);
}

export function accountsFromEnv(env = process.env) {
  const sources = [
    "LINEAR_ACCOUNTS",
    "LINEAR_ACCOUNTS_FILE",
    "LINEAR_API_KEY",
  ].filter((key) => env[key]);
  if (sources.length > 1)
    fail(
      "AUTH_CONFIG",
      "Set only one of LINEAR_ACCOUNTS, LINEAR_ACCOUNTS_FILE, or LINEAR_API_KEY.",
    );
  if (!sources.length) return {};
  let accounts;
  try {
    accounts = env.LINEAR_API_KEY
      ? { default: env.LINEAR_API_KEY }
      : JSON.parse(
          env.LINEAR_ACCOUNTS || readFileSync(env.LINEAR_ACCOUNTS_FILE, "utf8"),
        );
  } catch {
    fail(
      "AUTH_CONFIG",
      "Cannot read Linear account configuration. Expected a JSON object of account aliases.",
    );
  }
  if (!accounts || typeof accounts !== "object" || Array.isArray(accounts))
    fail("AUTH_CONFIG", "Linear account configuration must be an object.");
  const result = Object.create(null);
  for (const [alias, value] of Object.entries(accounts)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(alias))
      fail(
        "AUTH_CONFIG",
        "Account aliases may contain letters, numbers, underscores, and hyphens.",
      );
    const credential = typeof value === "string" ? { apiKey: value } : value;
    if (
      !credential ||
      typeof credential !== "object" ||
      Array.isArray(credential) ||
      Object.keys(credential).length !== 1 ||
      !["apiKey", "accessToken"].includes(Object.keys(credential)[0])
    ) {
      fail(
        "AUTH_CONFIG",
        "Each account must be an API key string, {apiKey: ...}, or {accessToken: ...}.",
      );
    }
    const token = credential.apiKey ?? credential.accessToken;
    if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
      fail(
        "AUTH_CONFIG",
        "Account credentials must be nonempty single-line strings.",
      );
    result[alias] = credential.accessToken
      ? `Bearer ${token.trim()}`
      : token.trim();
  }
  return result;
}

export function selectAccount(accounts, alias) {
  const names = Object.keys(accounts);
  if (!names.length)
    fail(
      "AUTH_MISSING",
      "Configure LINEAR_ACCOUNTS, LINEAR_ACCOUNTS_FILE, or LINEAR_API_KEY privately.",
    );
  if (!alias && names.length > 1)
    fail("ACCOUNT_AMBIGUOUS", "Select --account explicitly.", {
      accounts: names,
    });
  const name = alias || names[0];
  if (!Object.hasOwn(accounts, name))
    fail("ACCOUNT_NOT_FOUND", "Unknown account alias.", { accounts: names });
  return { alias: name, authorization: accounts[name] };
}

export function createClient(authorization, fetchImpl = globalThis.fetch) {
  return async (query, variables = {}) => {
    const mutation = /^\s*mutation\b/.test(query);
    let response;
    let payload;
    try {
      response = await fetchImpl("https://api.linear.app/graphql", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      fail(
        mutation ? "WRITE_OUTCOME_UNKNOWN" : "NETWORK_ERROR",
        mutation
          ? "The write outcome is unknown. Re-read the target before retrying; a create may already exist."
          : "The Linear request failed or timed out. No response details or credentials were logged.",
      );
    }
    if (response.status === 401 || response.status === 403)
      fail(
        "AUTH_DENIED",
        "Linear denied access. Check the account, key permissions, and team restrictions.",
      );
    try {
      payload = await response.json();
    } catch {
      if (response.status !== 429)
        fail(
          mutation ? "WRITE_OUTCOME_UNKNOWN" : "API_ERROR",
          mutation
            ? "The write response was unreadable. Re-read before retrying."
            : "Linear returned an unreadable response.",
        );
    }
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    if (
      response.status === 429 ||
      errors.some((error) => error.extensions?.code === "RATELIMITED")
    ) {
      fail(
        "RATE_LIMITED",
        "Linear rate limited the request. Wait before retrying; writes are never automatically retried.",
        {
          retryAfter: response.headers.get("retry-after"),
          resetAt: response.headers.get("x-ratelimit-requests-reset"),
        },
      );
    }
    if (!response.ok || errors.length || !payload?.data) {
      // Server messages can echo input. Return stable codes, never raw response bodies.
      fail(
        mutation ? "WRITE_NOT_CONFIRMED" : "API_ERROR",
        mutation
          ? "Linear did not confirm the write. Re-read before retrying."
          : "Linear rejected the query; check IDs, access, and current schema.",
        {
          status: response.status,
          codes: errors
            .map((error) => error.extensions?.code)
            .filter(
              (code) => typeof code === "string" && /^[A-Z_]+$/.test(code),
            ),
        },
      );
    }
    return payload.data;
  };
}

export async function paginate(
  client,
  query,
  variables,
  { all = false, limit = 50, after = null } = {},
) {
  const nodes = [];
  let cursor = after;
  for (let page = 0; page < (all ? 100 : 1); page++) {
    const { result } = await client(query, {
      ...variables,
      first: limit,
      after: cursor,
    });
    if (
      !Array.isArray(result?.nodes) ||
      typeof result.pageInfo?.hasNextPage !== "boolean"
    )
      fail("INVALID_RESPONSE", "Linear returned an invalid page.");
    nodes.push(...result.nodes);
    if (!result.pageInfo.hasNextPage)
      return { nodes, pageInfo: result.pageInfo, complete: true };
    const next = result.pageInfo.endCursor;
    if (!next || next === cursor)
      fail(
        "INVALID_RESPONSE",
        "Linear returned a repeated or missing pagination cursor.",
      );
    cursor = next;
    if (!all) return { nodes, pageInfo: result.pageInfo, complete: false };
  }
  return {
    nodes,
    pageInfo: { hasNextPage: true, endCursor: cursor },
    complete: false,
  };
}
