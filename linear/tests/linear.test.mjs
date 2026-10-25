import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  accountsFromEnv,
  selectAccount,
  createClient,
  paginate,
} from "../lib/client.mjs";
import { issueId, queries, execute } from "../lib/operations.mjs";
import { parse, run } from "../scripts/linear.mjs";

const workspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example",
  urlKey: "example",
};
const team = "22222222-2222-4222-8222-222222222222";
const viewer = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Engineer",
  email: "person@example.com",
};
const issue = {
  id: "44444444-4444-4444-8444-444444444444",
  identifier: "ENG-1",
  title: "Example",
  url: "https://linear.app/example/issue/ENG-1/title",
};
const identity = { viewer, organization: workspace };
const lastPage = {
  nodes: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const opts = { workspace: workspace.id };
function fakeClient(handler = () => ({ result: lastPage })) {
  const calls = [];
  const client = async (query, variables = {}) => {
    calls.push({ query, variables });
    return query === queries.verify ? identity : handler(query, variables);
  };
  return {
    client,
    calls,
    writes: () => calls.filter((call) => call.query.startsWith("mutation")),
  };
}
const rejects = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);

test("account selection is explicit, supports API keys and OAuth, and lists aliases only", async () => {
  const env = {
    LINEAR_ACCOUNTS: JSON.stringify({
      work: "private-key",
      other: { accessToken: "private-oauth" },
    }),
  };
  const accounts = accountsFromEnv(env);
  assert.equal(accounts.work, "private-key");
  assert.equal(accounts.other, "Bearer private-oauth");
  assert.throws(() => selectAccount(accounts), { code: "ACCOUNT_AMBIGUOUS" });
  assert.throws(() => selectAccount(accounts, "missing"), {
    code: "ACCOUNT_NOT_FOUND",
  });
  assert.deepEqual(await run(["accounts"], { env }), {
    accounts: ["work", "other"],
  });
  assert.equal(selectAccount(accounts, "other").alias, "other");
  assert.equal(
    selectAccount(accountsFromEnv({ LINEAR_API_KEY: "single" })).alias,
    "default",
  );
});

test("private file credentials and malformed config never echo secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "linear-skill-"));
  try {
    const file = join(dir, "accounts.json");
    writeFileSync(file, '{"work":{"apiKey":"private-key"}}', { mode: 0o600 });
    assert.equal(
      accountsFromEnv({ LINEAR_ACCOUNTS_FILE: file }).work,
      "private-key",
    );
    for (const env of [
      { LINEAR_ACCOUNTS: "private-key" },
      { LINEAR_ACCOUNTS: "[]" },
      {
        LINEAR_ACCOUNTS:
          '{"work":{"apiKey":"private-key","accessToken":"private-key"}}',
      },
      { LINEAR_API_KEY: "private-key", LINEAR_ACCOUNTS: "{}" },
    ]) {
      assert.throws(
        () => accountsFromEnv(env),
        (error) =>
          error.code === "AUTH_CONFIG" &&
          !error.message.includes("private-key"),
      );
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("CLI rejects unknown commands, flags, repeated targets, missing values and positional arguments", () => {
  for (const argv of [
    ["delete-issue"],
    ["issue", "--token", "secret"],
    ["issue", "--issue", "ENG-1", "--issue", "ENG-2"],
    ["issue", "--issue"],
    ["issue", "ENG-1"],
  ]) {
    assert.throws(() => parse(argv), { code: "USAGE" });
  }
});

test("help and accounts work without credentials; missing auth is a structured CLI failure", async () => {
  assert.ok(
    (await run(["create-issue", "--help"], { env: {} })).commands[
      "create-issue"
    ],
  );
  const result = spawnSync(process.execPath, ["scripts/linear.mjs", "verify"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).error.code, "AUTH_MISSING");
});

test("only Linear issue URLs in the verified workspace are accepted", () => {
  assert.equal(issueId(issue.url, workspace), "ENG-1");
  assert.equal(issueId("eng-1", workspace), "ENG-1");
  for (const value of [
    "https://linear.app.evil.test/example/issue/ENG-1",
    "http://linear.app/example/issue/ENG-1",
    "https://linear.app@example.org/example/issue/ENG-1",
    "some arbitrary name",
  ]) {
    assert.throws(() => issueId(value, workspace), { code: "INVALID_INPUT" });
  }
  assert.throws(
    () => issueId("https://linear.app/other/issue/ENG-1/title", workspace),
    { code: "WORKSPACE_MISMATCH" },
  );
});

test("workspace guards block writes before any target mutation", async () => {
  for (const options of [{}, { workspace: team }]) {
    const api = fakeClient();
    await rejects(
      execute("create-issue", { ...options, team, title: "Test" }, api.client),
      options.workspace ? "WORKSPACE_MISMATCH" : "INVALID_INPUT",
    );
    assert.equal(api.writes().length, 0);
    assert.equal(api.calls.length, 1);
  }
});

test("paged reads preserve continuation; --all follows exact cursors", async () => {
  const seen = [];
  const client = async (_, variables) => {
    seen.push(variables.after);
    return {
      result: variables.after
        ? { nodes: [2], pageInfo: { hasNextPage: false, endCursor: "end" } }
        : { nodes: [1], pageInfo: { hasNextPage: true, endCursor: "next" } },
    };
  };
  assert.equal((await paginate(client, "query", {})).complete, false);
  seen.length = 0;
  assert.deepEqual(
    (await paginate(client, "query", {}, { all: true })).nodes,
    [1, 2],
  );
  assert.deepEqual(seen, [null, "next"]);
  await rejects(
    paginate(
      async () => ({
        result: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "same" },
        },
      }),
      "query",
      {},
      { all: true },
    ),
    "INVALID_RESPONSE",
  );
});

test("bounded --all reports incomplete output with a usable cursor", async () => {
  let page = 0;
  const result = await paginate(
    async () => ({
      result: {
        nodes: [++page],
        pageInfo: { hasNextPage: true, endCursor: String(page) },
      },
    }),
    "query",
    {},
    { all: true },
  );
  assert.equal(page, 100);
  assert.equal(result.complete, false);
  assert.equal(result.pageInfo.endCursor, "100");
});

test("issue search applies server filters including me, priority zero and updated timestamp", async () => {
  const api = fakeClient();
  await execute(
    "issues",
    {
      query: "login",
      team,
      assignee: "me",
      priority: "0",
      "updated-since": "2026-10-20T00:00:00Z",
    },
    api.client,
  );
  const call = api.calls[1];
  assert.equal(call.query, queries.search);
  assert.equal(call.variables.term, "login");
  assert.deepEqual(call.variables.filter, {
    team: { id: { eq: team } },
    assignee: { id: { eq: viewer.id } },
    priority: { eq: 0 },
    updatedAt: { gte: "2026-10-20T00:00:00Z" },
  });
});

test("team label discovery includes workspace-wide labels", async () => {
  const api = fakeClient();
  await execute("labels", { team }, api.client);
  assert.deepEqual(api.calls[1].variables.filter, {
    or: [{ team: { id: { eq: team } } }, { team: { null: true } }],
  });
});

test("comments unwrap and paginate the issue connection", async () => {
  const api = fakeClient(() => ({
    issue: {
      result: { ...lastPage, nodes: [{ id: "comment", body: "Hello" }] },
    },
  }));
  const result = await execute("comments", { issue: "ENG-1" }, api.client);
  assert.equal(result.nodes[0].body, "Hello");
  assert.equal(result.complete, true);
});

test("issue creation dry-run resolves me and leaves state omitted for the team default", async () => {
  const api = fakeClient();
  const result = await execute(
    "create-issue",
    { ...opts, team, title: "New", assignee: "me", "dry-run": true },
    api.client,
  );
  assert.deepEqual(result.requested.input, {
    title: "New",
    teamId: team,
    assigneeId: viewer.id,
  });
  assert.equal(result.dryRun, true);
  assert.equal(api.writes().length, 0);
});

test("duplicate creation stops before writing unless explicitly allowed", async () => {
  const api = fakeClient((query) =>
    query === queries.issues
      ? { result: { ...lastPage, nodes: [issue] } }
      : { result: { success: true, issue } },
  );
  await rejects(
    execute("create-issue", { ...opts, team, title: issue.title }, api.client),
    "DUPLICATE",
  );
  assert.equal(api.writes().length, 0);
  const result = await execute(
    "create-issue",
    { ...opts, team, title: issue.title, "allow-duplicate": true },
    api.client,
  );
  assert.equal(result.result.identifier, "ENG-1");
  assert.equal(api.writes().length, 1);
});

test("updates preserve omitted fields and incrementally add/remove labels", async () => {
  const api = fakeClient((query) => ({
    result: query === queries.issue ? issue : { success: true, issue },
  }));
  const result = await execute(
    "update-issue",
    { ...opts, issue: "ENG-1", "add-labels": team, clear: "assignee,due" },
    api.client,
  );
  assert.deepEqual(result.requested.input, {
    addedLabelIds: [team],
    assigneeId: null,
    dueDate: null,
  });
  assert.equal(result.before.id, issue.id);
  assert.equal(api.writes().length, 1);
});

test("invalid dates, priorities, label conflicts, empty updates, and guessed IDs never mutate", async () => {
  for (const fields of [
    { due: "2026-02-30" },
    { priority: "5" },
    { assignee: "Simon" },
    { labels: team, "add-labels": team },
    { "add-labels": team, "remove-labels": team },
    { clear: "state" },
    { due: "2026-10-25", clear: "due" },
    {},
  ]) {
    const api = fakeClient(() => ({ result: issue }));
    await rejects(
      execute(
        "update-issue",
        { ...opts, issue: "ENG-1", ...fields },
        api.client,
      ),
      "INVALID_INPUT",
    );
    assert.equal(api.writes().length, 0);
  }
});

test("comment previews by default and only posts with --post; dry-run always wins", async () => {
  for (const flags of [{}, { post: true }, { post: true, "dry-run": true }]) {
    const api = fakeClient((query) => ({
      result:
        query === queries.issue
          ? issue
          : { success: true, comment: { id: "comment", body: "Ready" } },
    }));
    const result = await execute(
      "comment",
      { ...opts, issue: issue.url, body: "Ready", ...flags },
      api.client,
    );
    assert.equal(api.writes().length, flags.post && !flags["dry-run"] ? 1 : 0);
    assert.equal(result.requested.input.issueId, issue.id);
  }
});

test("project creation and update use current statusId and date fields", async () => {
  const api = fakeClient((query) => ({
    result: query === queries.project ? { id: team, name: "Old" } : lastPage,
  }));
  const created = await execute(
    "create-project",
    {
      ...opts,
      teams: team,
      name: "Launch",
      status: issue.id,
      lead: "me",
      target: "2026-12-01",
      "dry-run": true,
    },
    api.client,
  );
  assert.deepEqual(created.requested.input, {
    name: "Launch",
    teamIds: [team],
    statusId: issue.id,
    leadId: viewer.id,
    targetDate: "2026-12-01",
  });
  const updated = await execute(
    "update-project",
    {
      ...opts,
      project: team,
      name: "Launch 2",
      clear: "lead",
      "dry-run": true,
    },
    api.client,
  );
  assert.deepEqual(updated.requested.input, { name: "Launch 2", leadId: null });
  assert.equal(api.writes().length, 0);
});

test("client fixes the endpoint, prevents redirects, and selects the right Authorization format", async () => {
  let request;
  const client = createClient("Bearer private-oauth", async (url, init) => {
    request = { url, init };
    return Response.json({ data: identity });
  });
  assert.deepEqual(await client(queries.verify), identity);
  assert.equal(request.url, "https://api.linear.app/graphql");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.Authorization, "Bearer private-oauth");
});

test("partial GraphQL errors fail even with HTTP 200 and never echo server secrets", async () => {
  const client = createClient("private-key", async () =>
    Response.json({
      data: identity,
      errors: [{ message: "private-key", extensions: { code: "FORBIDDEN" } }],
    }),
  );
  await assert.rejects(
    client(queries.verify),
    (error) =>
      error.code === "API_ERROR" &&
      !JSON.stringify(error).includes("private-key"),
  );
});

test("rate limit and access failures are structured even with non-JSON error bodies", async () => {
  await rejects(
    createClient(
      "key",
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "60" },
        }),
    )(queries.verify),
    "RATE_LIMITED",
  );
  await rejects(
    createClient(
      "key",
      async () => new Response("denied", { status: 401 }),
    )(queries.verify),
    "AUTH_DENIED",
  );
});

test("network failure during a mutation is uncertain and never retried", async () => {
  let attempts = 0;
  const client = createClient("private-key", async () => {
    attempts++;
    throw new Error("private-key");
  });
  await rejects(
    client(queries["create-issue"], { input: { teamId: team, title: "Test" } }),
    "WRITE_OUTCOME_UNKNOWN",
  );
  assert.equal(attempts, 1);
});

test("false mutation success is never reported as a completed write", async () => {
  const api = fakeClient((query) => ({
    result: query === queries.issue ? issue : { success: false, issue },
  }));
  await rejects(
    execute(
      "update-issue",
      { ...opts, issue: "ENG-1", priority: "1" },
      api.client,
    ),
    "WRITE_NOT_CONFIRMED",
  );
  assert.equal(api.writes().length, 1);
});
