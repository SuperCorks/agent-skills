---
name: kernel-time-drafts
description: Reconstruct past work into Kernel bulk time drafts, or consolidate fragmented draft entries into reviewable blocks while preserving reviewed dates. Use for catch-up time-entry links and regrouping drafts, not invoices, task effort estimates, or accepting drafts.
---

# Kernel Time Drafts

Produce a private Kernel review link with useful work blocks. Default to a **15-minute minimum per consolidated block**, unless the user specifies otherwise. Minute-by-minute activity is evidence for grouping, not a useful final draft.

Use the sibling [Kernel skill](../kernel/SKILL.md) for authentication, current API documentation, versions, and idempotency. This skill adds reconstruction and grouping decisions, without replacing the live API contract.

## Scope and current state

- Resolve dates in the user's timezone, including different ranges per client. Determine each entry's date after timezone conversion; UTC date prefixes are insufficient.
- Read the current draft, including removed entries, and save a private before snapshot. The user may have edited it since creation. If asked to adjust one date, preserve all other dates exactly, including removed entries. Preserve task definitions, staged changes, task assignments, and billing flags unless explicitly asked to change them.
- A request to prepare or adjust a draft authorizes that draft work. It does not authorize acceptance, changes to recorded time, task completion, or changing task Duration estimates. Do not add an approval step to work already authorized.

## Reconstruct work when needed

Start with Kernel's portfolio, tasks, recorded time, and open drafts. Reuse existing tasks by UUID and preserve billing settings. Search before proposing tasks; proposed tasks stay inside the draft until acceptance.

Use relevant available evidence: dated agent conversations, task work notes, authored Slack or email, meetings, and version history. Follow the relevant reader skills. Reading history does not authorize messages or changes in those sources.

- Exclude work already recorded against the same task or covered by another open draft. Report a material collision instead of silently altering recorded time.
- Agent execution is not a human timesheet. Do not charge an entire background run, overnight wait, deployment queue, or thread lifespan. Deduplicate inherited messages and child-agent work against the parent assignment.
- Messages and commits establish work, rarely its precise duration. Label reconstructed durations and placement as estimates, retain useful source links, and leave uncertain client attribution unresolved.
- Do not manufacture work for a client merely because it exists in the portfolio. Mention meaningful coverage gaps.

## Group into useful blocks

Group by **local date, task, and billable setting**. Start with one block per task per day. Split only when distinct sessions materially help review and every resulting block meets the minimum.

1. Sum fragments first, then apply the minimum once. Twelve one-minute fragments become one 15-minute block, not twelve 15-minute blocks. A 34-minute total can remain 34 minutes: a minimum does not mean rounding every duration to quarter hours.
2. Keep tasks and clients separate. Do not redistribute minutes between unrelated tasks to make blocks fit. Bring consolidated totals below the minimum up to that minimum and disclose the added time.
3. Place blocks near the observed work. Explain that scattered activity is represented as an estimated block, rather than implying its interval was measured. Keep the entire interval within its local date.
4. Preserve user notes and useful source links. Distinguish new grouping notes from historical descriptions of the original fragments.
5. Check collisions against recorded time and other draft blocks. Improve placement within the evidence window where feasible. Disclose unresolved overlaps; do not claim the timeline is exact or inflate duration to fill the whole evidence window.

Compute counts and totals from the actual plan. Report the before/after total and added minutes when the minimum changes the total; do not hand-calculate or hard-code them.

## Regroup an existing day

The offline helper [scripts/regroup.py](scripts/regroup.py) plans grouping from a complete current draft snapshot. It makes no API calls and needs no credentials:

```bash
python3 scripts/regroup.py /private/path/before.json \
  --date 2026-10-24 --out /private/path/plan.json
```

It groups active entries on the selected local date, retains one entry per group, plans soft removal of the redundant fragments, preserves notes, and computes totals and approximate placement. Review its intervals and collisions before applying. It does not estimate missing work.

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

The check covers untouched dates, task definitions, retained entry identity and billing, planned removals, minimum duration, and computed totals. Return the API's actual `reviewUrl`, with a short account of the affected dates, block count, minimum, total changes, and unresolved overlaps. Acceptance stays with the user.

Keep private snapshots, source history, credentials, and client-specific examples outside this skill folder.
