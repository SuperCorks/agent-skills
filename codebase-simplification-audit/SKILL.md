---
name: codebase-simplification-audit
description: Audit a codebase or bounded subsystem for material structural simplifications without changing it. Use when the user requests a comprehensive simplification audit, not for implementing refactors or ordinary style cleanup.
---

# Codebase Simplification Audit

Produce a read-only, coverage-accountable assessment of opportunities to make the system materially easier to understand, change, or operate. Do not edit code, configuration, tests, documentation, generated files, or repository metadata.

Record the starting worktree state. Keep tool output and scratch data outside the repository, and avoid commands that create repository caches or generated artifacts. If an inspection tool unavoidably writes something, remove only the artifacts created by this audit and verify the user's starting changes remain untouched.

## Set the coverage contract

Before evaluating opportunities:

1. Define the requested scope and exclusions.
2. Inventory its meaningful subsystems from repository structure, manifests, ownership boundaries, runtime entry points, and dependency edges.
3. Publish a coverage contract listing every scoped subsystem. Group only components that share the same representation, owner, and runtime role.

The final report must record either `recommend` or `skip` for every item in this contract. A sampled review is not a comprehensive audit unless the user explicitly requested sampling.

## Evaluate material simplifications

Trace how each subsystem represents state, assigns responsibility, and performs its important work. Accept a candidate only when it simplifies at least one of these dimensions:

- **Representation:** removes duplicated models or translations, makes invalid states harder to express, or replaces scattered condition combinations with a clearer domain representation.
- **Ownership:** establishes one authoritative owner for a rule, lifecycle, or state transition and removes synchronization or ambiguity between competing owners.
- **Algorithm:** eliminates repeated work, unnecessary passes, incidental coordination, or a custom mechanism that can be replaced by a simpler proven primitive.

Require exact evidence: relevant files and symbols, the current flow, the duplicated rule or unnecessary mechanism, and the consumers affected. Prefer execution-path evidence over filename inference.

Reject candidates that are primarily renaming, formatting, comment churn, file movement, speculative abstraction, abstraction for a single trivial use, or fewer lines without lower cognitive or operational cost. Do not recommend replacing working project conventions merely because another style is preferred.

## Record coverage decisions

For each contracted subsystem, record:

- `recommend`: the current structure, proposed simpler structure, why it is material, evidence, affected consumers, preserved behavior, migration/validation needs, and main tradeoff; or
- `skip`: what was inspected and the concrete reason no material simplification is justified.

If evidence is incomplete, mark the candidate unproven rather than promoting it to a recommendation.

## Consolidate and prioritize

- Merge findings that stem from the same duplicated ownership, representation, or algorithm. Do not count downstream symptoms as separate opportunities.
- Remove proposals made obsolete by a higher-level recommendation.
- Rank the remaining recommendations by expected reduction in system complexity, confidence, breadth of benefit, migration risk, and validation cost.
- Keep low-confidence or high-risk ideas in a separate follow-up section; do not dilute the prioritized list.

## Report

- Scope, exclusions, and coverage contract
- Coverage ledger with `recommend` or `skip` for every subsystem
- Deduplicated recommendations in priority order, each with exact evidence and tradeoffs
- Cleared areas where the present design is already appropriately simple
- Unproven candidates and the evidence needed to decide them

End with an explicit coverage count, compare the final worktree state with the recorded baseline, and confirm that no intentional or incidental audit-created repository changes remain. Identify pre-existing user changes that were left untouched.
