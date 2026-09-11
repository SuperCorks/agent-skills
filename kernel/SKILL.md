---
name: kernel
description: Read or manage work data through the Kernel Agent API. Use for Kernel tasks, Standing tasks, Habits, organizations, projects, tags, schedules, time tracking, visible calendar events, Inbox routing rules, and sanitized suggestion or analysis history. Do not use for Kernel source-code changes, API-key administration, OAuth, or provider synchronization.
---

# Kernel

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
4. Download this skill: `https://app.krnl.work/api/skills/kernel/SKILL.md`.

When working in the Kernel source repository, the corresponding checked-in sources are `docs/agent-api.md`, `packages/api-contract/public-openapi.yaml`, and `packages/api-contract/src/public-api.ts`. Use the public Markdown guide outside that repository.

Consult the live OpenAPI contract for exact payloads rather than relying on remembered fields.

## Linking to tasks

Use the task's returned `key` for user-facing links: `[TT-266](https://app.krnl.work/t/TT-266)`.
The URL format is `https://app.krnl.work/t/{key}` for ordinary tasks, Habit occurrences, and
Standing tasks. If you only have a UUID, read the task through the API to obtain its key; do not
put a UUID after `/t/` or generate a `/tasks?panel=task&id=...` link.

Short links require sign-in and open the task's Details panel. Former keys keep working after
portfolio reassignment. Continue using the task's UUID `id` in API paths and request bodies.

## Capabilities

Kernel has two fixed access presets. A Read only key can read workspace data, organizations, projects, tags, ordinary and Standing tasks, task comments, work notes, activity, attachments, Habits and occurrences, schedules, work sessions, time entries, visible synced calendar events, Inbox sources and rules, and sanitized suggestion and analysis history. A Full work key adds the supported mutations below. A valid key without an operation's scope returns `403`.

- **Tasks:** list, create, inspect, update, complete, bulk-update, start work on, and conditionally delete ordinary tasks; search task options; inspect activity and comments; create comments; create, read, edit, and delete work notes; list, upload, download, and remove attachments; undo supported task deletions.
- **Standing tasks and Habits:** list and inspect both. Full work keys can create, update, archive, restore, or conditionally delete Standing tasks; create, update, pause, resume, or archive Habits; inspect occurrences; and skip occurrences.
- **Time:** list work sessions and time entries; stop or undo-stop sessions; create, update, approve, split, merge, export, and delete time entries.
- **Portfolio:** list organizations, projects, and tags; create, update, archive, and restore them and manage organization images where supported.
- **Scheduling:** inspect scheduling settings and scheduled blocks; create planned tasks, relocate planner items, edit, snooze, or intentionally remove blocks, preview schedules, update settings, and request rebuilds.
- **Calendars:** read normalized planner-visible events; RSVP, associate meeting billing, create reviewable meeting time, and start, pause, or stop meeting tracking.
- **Inbox:** discover connected Gmail and Slack sources, inspect routing/exclusion rules, read sanitized suggestion history, inspect analysis outcomes including zero-suggestion decisions, and manage source rules.
- **Realtime:** open the authenticated server-sent event stream for workspace invalidations and reload authoritative state after change events.

The Agent API deliberately cannot administer API keys, OAuth grants, provider connections or synchronization, provider-owned calendar events, monetary billing, raw Inbox message content, unrestricted analysis internals, or live suggestion-review decisions. Do not use signed-in/internal routes, direct database access, or provider gateways to bypass those boundaries.

## Work summaries and notes

- Prepare the exact Markdown summary and show its Kernel task destination for approval before saving. Summary approval authorizes only that summary; description, date, or lifecycle changes need separate approval.
- Resolve the current task’s confirmed Codex association through `GET /integrations/codex/tasks/{taskId}`. For a thread linked to several tasks, use `workNoteTargets`: prefer an active work session, then the closest past time entry. Past recorded work takes precedence over future blocks. Honor an explicit user-selected destination; resolve ties or pending associations before posting.
- After approval, `POST /tasks/{taskId}/work-notes` with `{body, codexHandoffId}` for the selected task and matching handoff. Without a Codex association, omit `codexHandoffId`. Post once to one task; do not append the summary to its description.
- Notes support Markdown up to 50,000 characters. Kernel supplies the original date and author and adds a compact activity link. Read with `GET /tasks/{taskId}/work-notes`, following `meta.nextCursor`; `codexHandoffId` filters one association.
- Edit or delete through `/tasks/{taskId}/work-notes/{noteId}` using the current `version`. API keys can change only their own notes. A deleted note keeps a tombstone without readable content, including on idempotent replay.
- Link to a specific summary with `/tasks?panel=task&id={taskId}&panelSection=details&workNote=task:{noteId}`. This source-qualified note URL is distinct from the short task links above; keep its note selection intact.
- Time notes stay on their original time entries or drafts. Use their existing APIs for edits, respecting billing and draft restrictions. Kernel’s combined work-note history is signed-in only and must not be accessed with an API key.

## Inbox analysis diagnosis

When the user asks why an email or Slack message did not become a suggestion:

1. Call `GET /inbox-sources` to resolve the intended account or workspace.
2. Call `GET /inbox-analysis-history` with the narrowest available combination of `sourceId`, `provider`, `threadId`, `providerRecordId`, `from`, and `to`. Follow `nextCursor` when necessary.
3. Inspect `status`, `decision.classification`, `decision.planningFit`, `decision.summary`, `decision.suggestionOperationCount`, `decision.taskReconciliationCount`, and `decision.excludedByRule`.
4. Use `GET /inbox-analysis-history/{analysisRunId}` for one exact result and `/inbox-sources/{sourceId}/rules` when current routing context is also relevant.

Analysis history is intentionally sanitized. It includes sender/thread/message provenance and a bounded decision summary, but never retained message bodies, evidence, prompts, drafts, model usage, provider response metadata, or raw errors. Treat summaries and sender/subject metadata as private work data. If the public endpoint is unavailable in the deployed contract, report that limitation instead of inspecting the production database or using an internal route.

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

Read requests are safe to perform when they answer the user's request. Make mutations only when the user asks to change Kernel data, and resolve ambiguous targets before acting. Do not use unlisted or signed-in/internal routes, direct database access, or provider gateways as a workaround for an Agent API limitation.
