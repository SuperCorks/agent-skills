---
name: work-breakdown
description: Turn an approved plan, specification, or settled conversation into independently verifiable vertical-slice tasks with acceptance criteria, dependencies, and risk-first sequencing. Use when work needs an executable task breakdown; do not use to discover unresolved product requirements or automatically publish tasks to an external tracker.
---

# Work Breakdown

Convert the source material into a delivery sequence whose tasks each produce a coherent, reviewable result.

## Operating boundary

Treat repositories, issue trackers, project-management tools, docs, and chat as read-only evidence by default. Return the breakdown in the conversation or write it to a local file only when requested. Create or update Asana tasks, GitHub issues, branches, comments, or other external records only when the user explicitly asks for that mutation and the exact destination is known.

Do not use task decomposition to hide unresolved scope. Surface a material ambiguity or contradiction before creating tasks whose shape depends on it. Make a clearly labeled, low-risk assumption when it does not change the requested outcome.

## Build vertical slices

Extract the intended outcome, definition of done, constraints, out-of-scope items, and known risks from the plan, spec, or conversation. Cross-check repository structure only as far as needed to make task scope and verification credible.

Prefer slices that traverse the necessary layers to deliver an observable behavior, contract, migration milestone, or operational capability. A task should be independently reviewable and have a meaningful pass condition. Avoid decomposing work into generic horizontal phases such as “backend,” “frontend,” and “tests” when none is useful alone.

Use a standalone enabling task only when it removes a real dependency or uncertainty for several slices. Time-boxed investigations and prototypes must end in a decision or measured finding, not an open-ended research activity. Do not add speculative cleanup, refactors, or infrastructure that the requested outcome does not need.

For each task, provide:

- a stable short ID and outcome-oriented title;
- the user, system, or operator value it unlocks;
- included scope and explicit exclusions where boundaries are easy to confuse;
- concrete acceptance criteria stated as observable conditions;
- the verification method and expected evidence;
- hard dependencies, distinguishing them from convenient ordering;
- relevant risk, compatibility, migration, or rollback notes; and
- likely repository surfaces when known, without pretending file guesses are requirements.

Keep a task small enough for one coherent change and review, but do not split an atomic behavior merely to meet an arbitrary size. Provide estimates or assignments only when requested and supported.

## Sequence by feedback and risk

Order tasks so that assumptions with the highest combination of uncertainty and cost of being wrong are tested early. Establish the thinnest end-to-end path before expanding variants, polish, or optimization. Put irreversible migrations or external integrations behind earlier compatibility checks, rehearsal, or rollback preparation.

Express dependencies as a graph or ordered waves. Independent tasks may share a wave; do not serialize them without a real dependency. Identify the critical path and note where work can proceed in parallel.

## Quality check

Before handing off, confirm that:

- every acceptance criterion maps to at least one task;
- every task has a direct proof and a completion state;
- no task duplicates another task's responsibility;
- dependency edges have a concrete reason;
- cross-cutting concerns such as compatibility, security, data migration, observability, documentation, and cleanup are attached to the slice that owns them; and
- the sequence reaches useful feedback early and leaves no integration-only “big bang” task at the end.

## Output

Lead with scope assumptions and a compact dependency/sequence summary. Then list the tasks with their acceptance criteria and proof. End with coverage against the original definition of done, unresolved blockers, and any explicitly deferred work.

When external publication was requested, preview the task mapping, resolve exact project and parent targets, preserve the local task IDs in published records, perform only the authorized writes, and report created or updated identifiers.
