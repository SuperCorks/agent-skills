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

For a diagnosis-only request, use `bug-diagnosis` and stop after evidence-backed cause analysis unless the user also asks for a fix.

## Inputs expected

- User request and success criteria.
- Repository context (current behavior, architecture, constraints).
- Applicable non-functional requirements (security, performance, compatibility).

## Workflow

1. Discovery and intent lock:
   - Restate the problem, constraints, and observable definition of done.
   - Ask clarifying questions only if they materially affect implementation.
2. Codebase exploration:
   - Map relevant entry points and trace the current behavior through its user-facing path.
3. Plan and approval gate:
   - Produce a concrete plan split into vertical units that each deliver and verify a coherent behavior, rather than separate layer-by-layer batches.
   - Halt before coding if scope or requirements are ambiguous.
4. Implement and verify by unit:
   - Apply the smallest complete vertical unit that matches the approved plan, then run its focused checks before continuing.
   - Avoid unrelated refactors and keep incomplete scaffolding from becoming the only evidence of progress.
   - A material plan deviation, or repeated small deviations that reveal a wrong model, is a replan signal: stop and revise the design rather than accumulating patches.
5. Validate the product:
   - Run project-appropriate lint, build, and test checks.
   - Exercise the real artifact or representative user path when practical; compilation and unit tests alone do not prove runtime behavior.
   - Perform targeted security and maintainability review.
6. Documentation and handoff:
   - Update user-facing docs when behavior changes.
   - Summarize changes, checks run, real-path evidence, and follow-up items.

## Output format (evidence required)

- Problem summary.
- Definition of done.
- Implementation plan and completed vertical units.
- Files changed.
- Commands executed (exact) and results summary.
- Real artifact/user-path verification, or why it was not practical.
- Risks and follow-ups.

## Quality gate / halt conditions

- Halt if required requirements are unknown or contradictory.
- Halt if validation checks fail and report root cause plus next corrective action.
- Stop and return to planning when implementation materially diverges from the design or repeated deviations invalidate its assumptions.
- Do not claim orchestration of runtime subagents; use staged execution only.

## Specialist skill references (manual/conditional)

- Planning-heavy tasks: use `architect-planning`.
- Architecture mapping: use `codebase-explorer`.
- Diagnosis without an authorized fix: use `bug-diagnosis`.
- Security review: use `security-guidance`.
- Test strategy and execution: use `test-engineer`.
- Maintainability review: use `pr-review-guidelines`.
- Docs updates: use `docs-maintainer`.
- Refactor-only tasks: use `code-simplifier`.
- Branch/PR gates: use `git-workflow-gates`.
