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
   - When unresolved intent or requirements would change the plan, use `requirements-interview` if available. Start from existing context, investigate factual questions, and ask only consequential human decisions; skip a separate interview for actionable requests.
   - Express acceptance criteria as falsifiable, observable outcomes rather than implementation claims.
2. Discover the current system:
   - Map relevant entry points, ownership, conventions, dependencies, and impacted surfaces.
   - Inspect repository documentation, ADRs, prior plans, and nearby decisions before proposing a new pattern. Treat absent historical evidence as unknown rather than inventing rationale.
   - Keep the source and status of consequential claims visible: user decisions, observed behavior, documented or researched facts, and agent inferences are different evidence. Carry unresolved assumptions and deliberate deferrals into the plan with the consequence if wrong; current behavior alone does not establish desired behavior.
   - For UI plans, use `frontend-design` to capture governing design sources, comparable surfaces, component reuse, layout/behavior rules, and necessary extensions. If unavailable, establish that context directly from project docs, source, and existing pages. A new page inherits the relevant product system unless redesign is requested.
3. Sketch the contract from the caller outward:
   - Write the caller's usage first (a README snippet plus two or three real call sites) showing the inputs, outputs, errors, and compatibility promises it observes. Derive the types from that usage and reconcile the sketch to it, not the reverse.
   - Define public interfaces and boundary contracts before internal helpers.
4. Model data and state:
   - Identify ownership, lifecycle, state transitions, persistence, and migration implications.
   - Name illegal or ambiguous states and explain whether the design prevents, represents, or validates them. Prefer types that cannot construct illegal states (discriminated unions, branded identifiers, values derived from one source) over runtime checks.
5. Examine operational boundaries where applicable:
   - Cover failures, authorization, transactions, concurrency, retries, and idempotency.
   - For each state-mutating operation, ask what happens if it runs twice or the previous run crashed at any point. State ordering, deduplication, and recovery guarantees, and plan reconciliation when the outcome depends on leftover state.
   - Before adding locks, check whether each concurrent actor can own its own file, key, or branch, merged at read time.
6. Choose the approach:
   - Define one primary design. For one-way-door decisions such as public contracts, durable schemas, or irreversible migrations, compare alternatives that differ in shape, not variants of one design; do not pad reversible choices with ceremonial alternatives.
   - For a new requirement on an existing system, first sketch the system as if the requirement had existed on day one.
   - Screen the primary design and any alternatives against [references/design-red-flags.md](references/design-red-flags.md).
   - When running something can settle an open question (behavior, timing, output, performance, layout), build a throwaway prototype in a scratch directory outside the working tree and decide from what you observe. Reserve user questions for product or preference calls.
   - For a consequential one-way-door design, offer `candidate-bakeoff` (Claude vs Codex by default) and run it when the user asks: pass the design brief, a 3-6 item rubric drawn from the acceptance criteria and design red flags, and the candidate list; plan from the chosen base and grafts it returns, and record its rationale and the rejected shape under the one-way-door alternatives.
7. Make execution decision-complete:
   - Sequence vertical, independently verifiable units and name the files, contracts, tests, migration/compatibility work, rollout, and rollback involved.
   - For internal APIs with no external consumers, migrate every caller and delete the old path in the same unit. Remove obsolete code before adding, and declare any planned temporary breakage instead of writing throwaway compatibility code.
   - Carry UI design criteria and reference sources into the implementation handoff, with source checks and rendered comparisons that can establish consistency. Label unavailable evidence instead of treating visual assumptions as verified facts.

## Output format (evidence required)

- Problem summary.
- Proposed solution.
- Caller-facing contract or interface sketch.
- Data/state model and boundary guarantees, when relevant.
- Falsifiable acceptance criteria (definition of done).
- Out of scope.
- Step-by-step implementation plan.
- Repo impact (repos and files).
- Risks, one-way-door alternatives, and decision rationale, including accepted tradeoffs stated as "we accept X in exchange for Y" wherever a reader might mistake one for an oversight.
- Testing notes.
- Rollback/migration notes.
- Open questions (only if required).

## Quality gate / halt conditions

- Do not start implementation in this stage.
- Halt if acceptance criteria or scope boundaries are not explicit.
- Do not call a plan decision-complete while caller contracts, durable state changes, or relevant retry/concurrency behavior remain implicit.
