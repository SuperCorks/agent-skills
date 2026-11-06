---
name: kernel-time-drafts
description: Reconstruct past work into Kernel bulk time drafts with verified thread and tracker associations, or consolidate fragmented draft entries into reviewable blocks while preserving reviewed dates and staged links. Use for catch-up time-entry links and regrouping drafts, not invoices, task effort estimates, or accepting drafts.
---

# Kernel Time Drafts

Produce a private Kernel review link with useful work blocks and the supporting entities staged on the right tasks. Default to a **15-minute minimum per consolidated block**, unless the user specifies otherwise. Minute-by-minute activity is evidence for grouping, not a useful final draft.

Use the sibling [Kernel skill](../kernel/SKILL.md) for authentication, current API documentation, versions, and idempotency. This skill adds reconstruction and grouping decisions, without replacing the live API contract.

## Scope and current state

- Resolve dates in the user's timezone, including different ranges per client. Determine each entry's date after timezone conversion; UTC date prefixes are insufficient.
- Read the current draft, including removed entries and task links, and save a private before snapshot. The user may have edited it since creation. If asked to adjust one date, preserve all other dates exactly, including removed entries. Preserve task definitions, staged changes, task assignments, integration links (including removed history), and billing flags unless explicitly asked to change them.
- A request to prepare or adjust a draft authorizes that draft work. It does not authorize acceptance, changes to recorded time, task completion, or changing task Duration estimates. Do not add an approval step to work already authorized.

## Reconstruct work when needed

Start with Kernel's portfolio, tasks, recorded time, and open drafts. Reuse existing tasks by UUID and preserve billing settings. Search before proposing tasks; proposed tasks stay inside the draft until acceptance.

Use relevant available evidence: dated agent conversations, task work notes, authored Slack or email, meetings, and version history. Follow the relevant reader skills. Reading history does not authorize messages or changes in those sources.

- Exclude work already recorded against the same task or covered by another open draft. Report a material collision instead of silently altering recorded time.
- Agent execution is not a human timesheet. Do not charge an entire background run, overnight wait, deployment queue, or thread lifespan. Deduplicate inherited messages and child-agent work against the parent assignment.
- Messages and commits establish work, rarely its precise duration. Label reconstructed durations and placement as estimates in the entry's **draft note**, never its work note (see [Work note and draft note](#work-note-and-draft-note)). Retain useful source links, and leave uncertain client attribution unresolved.
- Do not manufacture work for a client merely because it exists in the portfolio. Mention meaningful coverage gaps.

## Work note and draft note

Every draft entry has two text fields, and acceptance treats them differently:

- **`note` (work note)** becomes the time entry's note, so it may reach a client. Write only what
  changed, what was decided, and what remains. Keep out how long the block really took, that it
  was estimated or raised to a minimum, which evidence it came from, agent or tool names used as
  evidence, run time or waiting, and overlaps with other time. References a client would
  recognize, such as a pull request or a shared document, can stay.
- **`draftNote`** stays in the draft and its history; acceptance never copies it. Put the estimate
  basis here: the original minutes and the minimum applied, the evidence window and sources
  (agent threads, Slack, commits, with their links), what was excluded (agent run time, waiting),
  and placement caveats.

Send `draftNote` on entry creation (`entry.draftNote`, including the atomic `assignment` form) and
on `PATCH`. Reads return it for every entry. Before reporting the review link, read the final
aggregate and check that no entry's `note` carries estimate rationale, and that each estimated or
minimum-raised block has its basis in `draftNote`.

Existing drafts keep any estimate text already in a work note: do not move or rewrite it unless
the user asks, and preserve both fields exactly on dates you are not asked to change.

## Stage the supporting entities

When reconstructing work, stage the actual supporting Codex/T3 Code threads, Asana tasks, Linear
issues, GitHub issues and pull requests, and relevant HTTP(S) resources on each draft task. A
source merely mentioned in a conversation is not necessarily work for that task. Confirm the
relationship from the evidence and preserve unresolved attribution as a gap.

Use the Kernel skill's [Bulk time drafts and staged links](../kernel/SKILL.md#bulk-time-drafts-and-staged-links)
workflow and the current API guide:

- Save the draft's task and entry rows first. Stage links through
  `POST /bulk-time-drafts/{draftId}/tasks/{taskRef}/links` with `{version, link}` and
  `Idempotency-Key`; do not create placeholder live tasks or attach directly to an existing task
  while the work is awaiting review. Link staging requires `time:write` and `tasks:write`.
- For thread lookups, use **`draft.tasks[].id` as `taskId`**, including for an existing-task row.
  The row's `ref`, the parent draft ID, and the live task ID are different identities. Resolve the
  exact source thread and machine/environment through trusted thread metadata or the relevant
  reader, then stage the verified `{provider, machineId, lookupId, threadId}` result within its
  two-minute expiry. T3 threads use `provider:"t3code"` even when their model is Codex; native
  Codex sessions use `provider:"codex"`. Never select a thread or host by recency alone.
- Use the native Asana, Linear, GitHub issue, or pull request provider when available; a URL in an
  entry note does not create that association. Send provider identities and let Kernel resolve
  metadata. If a source is inaccessible or unverified, retain useful references in notes and
  report the missing association. Staging starts no agent turn or external task creation.
- Serialize link writes with other draft edits using each response's aggregate version. After an
  uncertain response, reuse the same request body and idempotency key, then inspect the draft.
- Verify the final aggregate has the intended active `tasks[].links` on the correct task rows.
  Report the staged sources and any gaps alongside the review link. Signed-in acceptance applies
  the associations with the task changes and time entries atomically; API keys cannot accept.

For regrouping alone, preserve existing links. If task reassignment is requested, moving all its
entries so the source row becomes orphaned carries its active links to the replacement; moving
only some entries leaves the links on the retained source. Re-read the resulting rows and stage
additional associations only when the evidence supports them. Removing a task or its last entry
excludes its links from acceptance. A plain link removal uses the draft link DELETE endpoint and
retains the removed row in history.

## Group into useful blocks

Group by **local date, task, and billable setting**. Start with one block per task per day. Split only when distinct sessions materially help review and every resulting block meets the minimum.

1. Sum fragments first, then apply the minimum once. Twelve one-minute fragments become one 15-minute block, not twelve 15-minute blocks. A 34-minute total can remain 34 minutes: a minimum does not mean rounding every duration to quarter hours.
2. Keep tasks and clients separate. Do not redistribute minutes between unrelated tasks to make blocks fit. Bring consolidated totals below the minimum up to that minimum and disclose the added time.
3. Place blocks near the observed work. Explain in the draft note that scattered activity is represented as an estimated block, rather than implying its interval was measured. Keep the entire interval within its local date.
4. Preserve user notes and useful source links in both fields. Grouping disclosure goes in the draft note, kept apart from the fragments' own descriptions, which stay in the work note.
5. Check collisions against recorded time and other draft blocks. Improve placement within the evidence window where feasible. Disclose unresolved overlaps; do not claim the timeline is exact or inflate duration to fill the whole evidence window.

Compute counts and totals from the actual plan. Report the before/after total and added minutes when the minimum changes the total; do not hand-calculate or hard-code them.

## Regroup an existing day

The offline helper [scripts/regroup.py](scripts/regroup.py) plans grouping from a complete current draft snapshot. It makes no API calls and needs no credentials:

```bash
python3 scripts/regroup.py /private/path/before.json \
  --date 2026-10-24 --out /private/path/plan.json
```

It groups active entries on the selected local date, retains one entry per group, plans soft removal of the redundant fragments, and computes totals and approximate placement. The retained entry's work note joins the fragments' own notes; the grouping disclosure (fragment count, minimum applied, approximate placement) and the fragments' previous draft notes go in its draft note. An operation with `needsWorkNote: true` has no work note to keep: write a client-facing one before applying. Review its intervals and collisions before applying. It does not estimate missing work.

Apply through Kernel's live public API:

- Recheck the snapshot before the first write; regenerate the plan if state changed.
- Patch each retained entry before removing its siblings so its task remains referenced. Keep the existing draft and review link.
- Mutate sequentially using the aggregate version returned by the previous operation. Persist each exact request body and unique Idempotency-Key before sending; reuse them only for an identical uncertain retry. On conflict, reread and reconcile.
- Save progress. If interrupted, reconcile current entries with the plan before resuming; never assume earlier writes failed. Stop on persistent errors and report what landed and what remains. Do not discard the draft as recovery.

Read the final aggregate, then verify against the original snapshot and the exact applied plan:

```bash
python3 scripts/regroup.py /private/path/before.json \
  --date 2026-10-24 --verify /private/path/after.json --plan /private/path/plan.json
```

The check covers untouched dates, task definitions (including their staged link snapshots), retained entry identity and billing, planned removals, minimum duration, and computed totals. Return the API's actual `reviewUrl`, with a short account of the affected dates, block count, minimum, total changes, staged sources, and unresolved overlaps or association gaps. Acceptance stays with the user.

Keep private snapshots, source history, credentials, and client-specific examples outside this skill folder.
