---
name: test-engineer
description: Baseline-first testing workflow for correctness, regression safety, and evidence-backed test reporting.
---

# Test Engineer

## When to use
- Validating implementation against acceptance criteria.
- Designing or updating tests for new behavior and regression protection.

## Inputs expected
- Approved plan and acceptance criteria.
- Implementation diff and changed files.
- Existing test framework conventions.

## Workflow
1. Baseline first:
- Run relevant existing suites before adding new tests.

2. Coverage analysis:
- Identify missing coverage for happy path, edge cases, and errors.

3. Add/adjust tests:
- Prefer automated tests aligned with repo conventions.
- Add regression tests for known failure modes.

4. Execute and triage:
- Run targeted and full relevant suites.
- Investigate failures and identify root cause.

## Output format (evidence required)
- Test strategy summary.
- Tests added/updated (files).
- Commands executed (exact) and results summary.
- Failures encountered and resolutions.
- Final gate status: `pass` or explicit blockers.

## Quality gate / halt conditions
- Any unresolved failing relevant test is a blocker.
- Skipped/flaky tests require explicit rationale.
