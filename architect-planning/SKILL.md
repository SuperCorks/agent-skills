---
name: architect-planning
description: Problem framing and decision-complete implementation planning before code changes.
---

# Architect Planning

## When to use

- A feature/bug needs a detailed implementation plan before coding.
- Trade-offs and repo impact must be explicit.
- You need acceptance criteria and a clear definition of done.

## Inputs expected

- User request and constraints.
- Current architecture and conventions from repo exploration.
- Non-functional constraints (security, performance, compatibility).

## Workflow

1. Lock the problem and evidence of success:
   - Clarify the objective, constraints, and out-of-scope work.
   - Express acceptance criteria as falsifiable, observable outcomes rather than implementation claims.
2. Discover the current system:
   - Map relevant entry points, ownership, conventions, dependencies, and impacted surfaces.
   - Inspect repository documentation, ADRs, prior plans, and nearby decisions before proposing a new pattern. Treat absent historical evidence as unknown rather than inventing rationale.
3. Sketch the contract from the caller outward:
   - Show how a user or caller invokes the behavior and what inputs, outputs, errors, and compatibility promises it observes.
   - Define public interfaces and boundary contracts before internal helpers.
4. Model data and state:
   - Identify ownership, lifecycle, state transitions, persistence, and migration implications.
   - Name illegal or ambiguous states and explain whether the design prevents, represents, or validates them.
5. Examine operational boundaries where applicable:
   - Cover failures, authorization, transactions, concurrency, retries, and idempotency.
   - State ordering, deduplication, and recovery guarantees when an operation can be repeated or overlap.
6. Choose the approach:
   - Define one primary design. Compare meaningful alternatives for one-way-door decisions such as public contracts, durable schemas, or irreversible migrations; do not pad reversible choices with ceremonial alternatives.
7. Make execution decision-complete:
   - Sequence vertical, independently verifiable units and name the files, contracts, tests, migration/compatibility work, rollout, and rollback involved.

## Output format (evidence required)

- Problem summary.
- Proposed solution.
- Caller-facing contract or interface sketch.
- Data/state model and boundary guarantees, when relevant.
- Falsifiable acceptance criteria (definition of done).
- Out of scope.
- Step-by-step implementation plan.
- Repo impact (repos and files).
- Risks, one-way-door alternatives, and decision rationale.
- Testing notes.
- Rollback/migration notes.
- Open questions (only if required).

## Quality gate / halt conditions

- Do not start implementation in this stage.
- Halt if acceptance criteria or scope boundaries are not explicit.
- Do not call a plan decision-complete while caller contracts, durable state changes, or relevant retry/concurrency behavior remain implicit.
