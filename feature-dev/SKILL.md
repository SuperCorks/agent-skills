---
name: feature-dev
description: Single-agent staged workflow for robust feature development from discovery through implementation, validation, and delivery.
---

# Feature Development Workflow

Use this skill to run an end-to-end feature workflow without assuming runtime subagents.

## When to use
- You need to implement a feature or bug fix with clear quality gates.
- The task needs planning, coding, testing, and delivery in one guided flow.
- You want deterministic stage outputs and explicit halt conditions.

## Inputs expected
- User request and success criteria.
- Repository context (current behavior, architecture, constraints).
- Applicable non-functional requirements (security, performance, compatibility).

## Workflow
1. Discovery and intent lock:
- Restate the problem, constraints, and definition of done.
- Ask clarifying questions only if they materially affect implementation.

2. Codebase exploration:
- Map relevant entry points and likely change hotspots.
- Trace the current execution path for impacted behavior.

3. Plan and approval gate:
- Produce a concrete implementation plan with acceptance criteria.
- Halt before coding if scope or requirements are ambiguous.

4. Implementation:
- Apply focused changes that match the approved plan.
- Avoid unrelated refactors.

5. Validation:
- Run project-appropriate lint/build/test checks.
- Perform targeted security and maintainability review.

6. Documentation and handoff:
- Update user-facing docs when behavior changes.
- Summarize changes, checks run, and any follow-up items.

## Output format (evidence required)
- Problem summary.
- Definition of done.
- Implementation plan.
- Files changed.
- Commands executed (exact) and results summary.
- Risks and follow-ups.

## Quality gate / halt conditions
- Halt if required requirements are unknown or contradictory.
- Halt if validation checks fail and report root cause plus next corrective action.
- Do not claim orchestration of runtime subagents; use staged execution only.

## Specialist skill references (manual/conditional)
- Planning-heavy tasks: use `architect-planning`.
- Architecture mapping: use `codebase-explorer`.
- Security review: use `security-guidance`.
- Test strategy and execution: use `test-engineer`.
- Maintainability review: use `pr-review-guidelines`.
- Docs updates: use `docs-maintainer`.
- Refactor-only tasks: use `code-simplifier`.
- Branch/PR gates: use `git-workflow-gates`.
