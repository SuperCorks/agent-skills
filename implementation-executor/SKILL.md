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
- Confirm plan approval and clean starting state.

2. Implement focused changes:
- Follow the plan strictly.
- Avoid unrelated refactors and scope creep.

3. Validate:
- Run project-appropriate lint/build/test commands.
- Capture exact commands and concise outcomes.

4. Prepare handoff:
- Summarize modified files and rationale.
- Note any blockers or follow-ups.

## Output format (evidence required)
- Summary of changes.
- Files modified/created.
- Commands executed (exact) and results summary.
- Reviewer notes (only when needed).

## Quality gate / halt conditions
- Halt and escalate if the plan must change materially.
- Halt on failed validation and report corrective next steps.
