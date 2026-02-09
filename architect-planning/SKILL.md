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
1. Understand and scope:
- Clarify objective, constraints, and out-of-scope items.

2. Analyze current state:
- Map existing architecture and impacted surfaces.

3. Propose plan:
- Define one primary approach and alternatives only when trade-offs are meaningful.

4. Make plan decision-complete:
- Explicit files to change/create.
- Interfaces/APIs/contracts to touch.
- Testing strategy and migration/compatibility notes.
- Rollback approach.

## Output format (evidence required)
- Problem summary.
- Proposed solution.
- Acceptance criteria (definition of done).
- Out of scope.
- Step-by-step implementation plan.
- Repo impact (repos and files).
- Risks and considerations.
- Testing notes.
- Rollback/migration notes.
- Open questions (only if required).

## Quality gate / halt conditions
- Do not start implementation in this stage.
- Halt if acceptance criteria or scope boundaries are not explicit.
