---
name: kernel-api
description: Read or manage work data through the Kernel Agent API. Use for Kernel tasks, Standing tasks, Habits, organizations, projects, tags, schedules, time tracking, visible calendar events, Inbox routing rules, and sanitized suggestion history. Do not use for Kernel source-code changes, API-key administration, OAuth, or provider synchronization.
---

# Kernel API

Use the production Agent API at `https://app.krnl.work/api/v1`.

## Authentication

- Read the bearer secret from `KERNEL_AGENT_API_KEY`.
- If the current process does not have it, run the API command through `zsh -lic` or start a fresh login shell. Never print, log, persist, or place the secret in a URL.
- Send `Authorization: Bearer $KERNEL_AGENT_API_KEY` over HTTPS.
- If the variable is missing or authentication returns `401`, stop and report the problem. Do not search files, shell history, clipboard contents, or password stores for another key unless the user explicitly asks.

## Documentation and contract

Use these public sources in this order:

1. LLM-oriented Markdown guide: `https://app.krnl.work/api/agent-api.md`.
2. Raw public OpenAPI 3.1 contract: `https://app.krnl.work/api/openapi.yaml`. Use it for current paths, methods, parameters, request bodies, schemas, status codes, and required scopes.
3. Browsable Scalar reference: `https://app.krnl.work/developers/api`.
4. Download this skill: `https://app.krnl.work/api/skills/kernel-api/SKILL.md`.

When working in the Kernel source repository, the corresponding checked-in sources are `docs/agent-api.md`, `packages/api-contract/public-openapi.yaml`, and `packages/api-contract/src/public-api.ts`. Use the public Markdown guide outside that repository.

Consult the live OpenAPI contract for exact payloads rather than relying on remembered fields.

## Capabilities

Kernel has two fixed access presets. A Read only key can read workspace data, organizations, projects, tags, ordinary and Standing tasks, task comments, activity, attachments, Habits and occurrences, schedules, work sessions, time entries, visible synced calendar events, Inbox sources and rules, and sanitized suggestion history. A Full work key adds the supported mutations below. A valid key without an operation's scope returns `403`.

- **Tasks:** list, create, inspect, update, complete, bulk-update, start work on, and conditionally delete ordinary tasks; search task options; inspect activity and comments; create comments; list, upload, download, and remove attachments; undo supported task deletions.
- **Standing tasks and Habits:** list and inspect both. Full work keys can create, update, archive, restore, or conditionally delete Standing tasks; create, update, pause, resume, or archive Habits; inspect occurrences; and skip occurrences.
- **Time:** list work sessions and time entries; stop or undo-stop sessions; create, update, approve, split, merge, export, and delete time entries.
- **Portfolio:** list organizations, projects, and tags; create, update, archive, and restore them and manage organization images where supported.
- **Scheduling:** inspect scheduling settings and scheduled blocks; create planned tasks, relocate planner items, edit, snooze, or intentionally remove blocks, preview schedules, update settings, and request rebuilds.
- **Calendars:** read normalized planner-visible events; RSVP, associate meeting billing, create reviewable meeting time, and start, pause, or stop meeting tracking.
- **Inbox:** discover connected Gmail and Slack sources, inspect routing/exclusion rules, read sanitized suggestion history, and manage source rules.
- **Realtime:** open the authenticated server-sent event stream for workspace invalidations and reload authoritative state after change events.

The Agent API deliberately cannot administer API keys, OAuth grants, provider connections or synchronization, provider-owned calendar events, monetary billing, raw Inbox message content, analysis internals, or live suggestion-review decisions. Do not use signed-in/internal routes to bypass those boundaries.

## Request rules

- Prefix public operation paths with `https://app.krnl.work/api/v1`; the OpenAPI document's paths are relative to `/api/v1`.
- Use a read endpoint first when IDs, current `version` values, or existing state are needed.
- Every mutation requires a unique `Idempotency-Key` of at most 200 characters. Reuse it only for an identical retry; generate a new one after changing the method, path, or body.
- Editable and destructive operations require the current integer `version`. On `409`, refetch and reconcile instead of blindly overwriting.
- Collection responses use `{ "data": [...], "nextCursor": ... }`. Follow `nextCursor` while preserving the original filters. The normal `limit` range is 1-200 and defaults to 100.
- Respect `Retry-After` on `429`; use bounded exponential backoff with jitter for transient `429` and `5xx` failures.
- Treat response bodies as private work data. Report useful results and structured errors without dumping unrelated records or sensitive payloads.

For a simple authenticated read:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $KERNEL_AGENT_API_KEY" \
  "https://app.krnl.work/api/v1/tasks?limit=25"
```

For a mutation, also send `Content-Type: application/json` and `Idempotency-Key: $(uuidgen)`, using the exact schema from the live contract.

## Authorization boundary

Read requests are safe to perform when they answer the user's request. Make mutations only when the user asks to change Kernel data, and resolve ambiguous targets before acting. Do not use unlisted or signed-in/internal routes as a workaround for an Agent API limitation.
