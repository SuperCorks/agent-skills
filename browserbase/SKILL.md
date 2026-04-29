---
name: browserbase
description: 'Use Browserbase and the browse CLI for browser automation, Fetch/Search API work, authenticated remote browsing, UI QA, debugging, tracing, and Browserbase platform or Functions workflows with multi-account support.'
---

# Browserbase

Use this skill when a task involves Browserbase, the `browse` CLI, browser automation, cloud browser sessions, Browserbase Fetch/Search APIs, authenticated remote browsing, UI QA, browser automation debugging, trace capture, or Browserbase Functions.

## Overview

This skill merges the reusable Browserbase workflows into one account-aware playbook:

- Browser mode: interact with pages through `browse`
- Fetch/Search mode: use Browserbase APIs when a full browser is unnecessary
- Platform mode: inspect projects, sessions, contexts, extensions, and usage through `bb`
- Functions mode: scaffold, develop, publish, and invoke Browserbase Functions
- Cookie context mode: reuse local authenticated state in remote Browserbase sessions
- QA/debug mode: test web apps, diagnose broken automation, and collect trace evidence

Use the lightest mode that satisfies the request. Search or fetch before opening a browser when page interaction is not needed.

## Setup

### Prerequisites

- Node.js 20+
- Chrome or Chromium for local browsing and cookie sync workflows
- `browse` CLI: `npm install -g @browserbasehq/browse-cli`
- `bb` CLI: `npm install -g @browserbasehq/cli`

### Multi-Account Environment Variables

Prefer `BROWSERBASE_ACCOUNTS` for all authenticated workflows. It is a JSON object mapping account aliases to credential objects:

```bash
export BROWSERBASE_ACCOUNTS='{
  "prod": {
    "apiKey": "bb_live_prod_123",
    "projectId": "proj_prod_123"
  },
  "sandbox": {
    "apiKey": "bb_live_sandbox_456",
    "projectId": "proj_sandbox_456",
    "contextId": "ctx_sandbox_789"
  }
}'
```

Supported account fields:

| Field | Required | Purpose |
|-------|----------|---------|
| `apiKey` | Yes | Browserbase API key used as `BROWSERBASE_API_KEY` |
| `projectId` | Recommended | Browserbase project id used as `BROWSERBASE_PROJECT_ID`; required for Functions workflows |
| `contextId` | No | Persistent authenticated browser context used as `BROWSERBASE_CONTEXT_ID` |
| `baseUrl` | No | Optional Browserbase API base URL override for advanced environments |

When multiple accounts are configured, pass `--account <name>`. If only one account is configured, it is selected automatically.

### Single-Account Fallback

For simple setups, the scripts also accept the upstream environment variables directly:

```bash
export BROWSERBASE_API_KEY="bb_live_..."
export BROWSERBASE_PROJECT_ID="proj_..."
export BROWSERBASE_CONTEXT_ID="ctx_..." # optional
```

This fallback resolves as an account named `default`.

## Setup Check

```bash
which browse || npm install -g @browserbasehq/browse-cli
which bb || npm install -g @browserbasehq/cli
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/list-accounts.js
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/verify-access.js --account sandbox
```

Use `verify-access.js` only for authenticated Browserbase API work. Local browsing does not require Browserbase credentials.

## Authentication Model

### Local Mode

No Browserbase credentials are required.

```bash
browse env local
browse open http://localhost:3000
```

Use local mode for localhost development, simple sites, deterministic QA, and tasks that do not need Browserbase cloud features.

### Remote Browserbase Mode

Remote mode uses `BROWSERBASE_API_KEY` from the resolved account.

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- env remote
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- open https://example.com
```

Use remote mode for protected sites, bot detection, CAPTCHAs, residential proxies, geo-specific access, scale, or persistent cloud browser contexts.

### Authenticated Remote Sessions

For sites where the user is already logged in locally, sync local cookies into a Browserbase context, then open the target URL with that context.

After a context exists, store it in `BROWSERBASE_ACCOUNTS.<account>.contextId` or pass it explicitly to `browse`:

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- env remote
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- open https://app.example.com --context-id ctx_abc123 --persist
```

Use one context per identity. Do not mix personal, work, client, or production identities in the same Browserbase context.

## Account-Aware Scripts

All scripts live under `.github/skills/browserbase/scripts/` when installed into a project. In examples, set `BROWSERBASE_SKILL_DIR` once if you are not already in the skill directory:

```bash
export BROWSERBASE_SKILL_DIR=.github/skills/browserbase
```

### list-accounts.js

List configured aliases without printing API keys.

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/list-accounts.js
```

### verify-access.js

Verify the selected account by running a read-only `bb projects list` smoke test.

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/verify-access.js --account prod
```

### run-bb.js

Run `bb` with the selected account's environment variables.

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- projects list
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- sessions create --solve-captchas --context-id ctx_abc123 --persist
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- fetch https://example.com --output /tmp/example.html
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- search "browserbase docs"
```

### run-browse.js

Run `browse` with the selected account's environment variables.

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- env remote
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- open https://example.com
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- snapshot
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- stop
```

When the selected account includes `contextId`, `run-browse.js -- open ...` automatically appends `--context-id <id> --persist` unless the command already has `--context-id`. Use `--no-account-context` to skip that behavior for a one-off unauthenticated page load.

## Choose The Right Mode

Use this decision order:

1. If the user only needs search results, use `run-bb.js -- search`.
2. If the user needs static HTML or JSON, use `run-bb.js -- fetch`.
3. If the user needs interaction, use `run-browse.js` with local or remote mode.
4. If the user needs login state remotely, use a persistent context before browsing.
5. If the user asks for Browserbase resources, Functions, sessions, contexts, extensions, or usage, use `run-bb.js`.
6. If the user asks to test a UI, run a QA plan with browser evidence.
7. If automation fails, switch to debugging: inspect URL, title, snapshot, console/network evidence, timing, auth state, and bot-detection symptoms.
8. If ordinary evidence is insufficient, capture a trace or use Browserbase session artifacts.

## Browser Workflows

### Local Browsing

```bash
browse env local
browse open http://localhost:3000
browse snapshot
browse stop
```

For existing local login state, use local auto-connect only when the task requires it:

```bash
browse env local --auto-connect
```

### Remote Browsing

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- env remote
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- open https://example.com
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- snapshot
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-browse.js --account prod -- stop
```

Prefer snapshots for interaction because they expose stable element references. Save screenshots when reporting visual bugs or ambiguous page states.

## Platform Workflows

Use `bb --help` and subgroup help before guessing flags:

```bash
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- --help
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- projects list
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- sessions get <session_id>
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- contexts create --body '{"region":"us-west-2"}'
node ${BROWSERBASE_SKILL_DIR:-.}/scripts/run-bb.js --account prod -- extensions upload ./extension.zip
```

## Functions Workflows

Functions workflows require `projectId` on the selected account.

```bash
BROWSERBASE_SKILL_DIR=${BROWSERBASE_SKILL_DIR:-$PWD}
node "$BROWSERBASE_SKILL_DIR/scripts/run-bb.js" --account prod -- functions init my-function
cd my-function
node "$BROWSERBASE_SKILL_DIR/scripts/run-bb.js" --account prod -- functions dev index.ts
node "$BROWSERBASE_SKILL_DIR/scripts/run-bb.js" --account prod -- functions publish index.ts
node "$BROWSERBASE_SKILL_DIR/scripts/run-bb.js" --account prod -- functions invoke <function_id> --params '{"url":"https://example.com"}'
```

If the command reports a missing project id, add `projectId` to the selected `BROWSERBASE_ACCOUNTS` entry.

## QA And Debugging Guidance

For QA tasks:

- plan functional, adversarial, accessibility, responsive, console, and visual checks before opening the browser
- collect evidence for every failure with a snapshot, eval result, console/network output, or screenshot path
- test localhost with local mode first for reproducibility
- use remote mode for deployed protected sites or parallel Browserbase sessions
- always stop sessions when done

For automation failures, check in this order:

- current URL and title
- latest snapshot and whether target elements exist
- authentication state and redirects
- console errors and failed requests
- loading, animation, or delayed hydration timing
- selector fragility versus accessibility refs
- bot detection, CAPTCHA, or geo/IP restrictions

## Safety Notes

- Never print API keys in chat or logs.
- Use wrappers instead of passing API keys on command lines.
- Treat `contextId` values as sensitive because they can carry authenticated browser state.
- Use one Browserbase context per person/account/site identity.
- Prefer read-only `bb` commands unless the user explicitly requests creation, publishing, deletion, or mutation.
- For destructive or costly operations, explain the action and use dry-run/preflight options when available.

## Error Codes

| Code | Description | Remediation |
|------|-------------|-------------|
| `BROWSERBASE_AUTH_MISSING` | No `BROWSERBASE_ACCOUNTS` or fallback API key configured | Set `BROWSERBASE_ACCOUNTS` or `BROWSERBASE_API_KEY` |
| `BROWSERBASE_AUTH_INVALID` | Account JSON is invalid or a credential is malformed | Check the JSON shape and required fields |
| `BROWSERBASE_ACCOUNT_AMBIGUOUS` | Multiple accounts are configured and none was selected | Pass `--account <name>` |
| `BROWSERBASE_ACCOUNT_NOT_FOUND` | Selected account alias does not exist | Run `node ${BROWSERBASE_SKILL_DIR:-.}/scripts/list-accounts.js` |
| `BROWSERBASE_PROJECT_ID_MISSING` | A Functions workflow needs a project id | Add `projectId` to the selected account |
| `BROWSERBASE_CLI_MISSING` | `bb` or `browse` is not installed | Install the missing CLI with npm |
| `BROWSERBASE_COMMAND_FAILED` | Wrapped `bb` or `browse` command failed | Read the command output and retry with narrower flags |
| `BROWSERBASE_ARGS_INVALID` | Required wrapper arguments are missing | Run the script with `--help` |