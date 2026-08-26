---
name: implementation-executor
description: Executes an approved implementation plan with focused changes and evidence-backed validation.
---

# Implementation Executor

## When to use

- You have an approved plan and need disciplined implementation.
- You must keep changes focused and aligned to existing conventions.

## Inputs expected

- Approved implementation plan.
- Current branch/repo state.
- Relevant coding conventions and constraints.

## Workflow

1. Verify prerequisites:
   - Confirm plan approval, branch state, repository conventions, and the plan's independently verifiable units.
2. Execute one unit at a time:
   - Implement the smallest complete unit that produces an observable behavior.
   - Keep changes aligned with the plan and avoid unrelated refactors or scope expansion.
   - Run the unit's focused validation before beginning the next unit.
3. Manage divergence:
   - Record a small, local adjustment that preserves the design and acceptance criteria.
   - Stop and return to planning for a material contract, data-model, or architecture change. Repeated minor deviations are also a signal that the design assumptions need revision.
4. Validate the integrated result:
   - Run the repository's relevant format, lint, build, and test commands.
   - Exercise the built artifact or representative user path when practical; record why if runtime verification is unavailable.
5. Prepare handoff:
   - Summarize modified files, completed units, rationale, commands, real-path evidence, and any blockers or follow-ups.

## Output format (evidence required)

- Summary of changes.
- Files modified/created.
- Completed implementation units.
- Commands executed (exact) and results summary.
- Real artifact/user-path verification, or why it was not practical.
- Reviewer notes (only when needed).

## Quality gate / halt conditions

- Halt and escalate if the plan must change materially.
- Halt and replan when repeated local deviations undermine the approved design.
- Halt on failed validation and report corrective next steps.
