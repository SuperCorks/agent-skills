---
name: test-engineer
description: Baseline-first testing workflow for correctness, regression safety, and evidence-backed test reporting.
---

# Test Engineer

## When to use

- Validating implementation against acceptance criteria.
- Driving a behavior change or protecting a reproduced defect with tests.

## Inputs expected

- Intended behavior, acceptance criteria, or the reproduced defect.
- Implementation diff and changed files when an implementation already exists.
- Existing test framework conventions.
- Authorization to change product code when the task includes implementation or a fix.

## Choose a mode

- **Validation mode:** assess an existing implementation against acceptance criteria and relevant regressions.
- **TDD/regression mode:** define a new behavior or reproduced defect at a stable public seam, observe the test fail, then implement or verify the fix.

Use only the mode the request needs. A validation task does not automatically authorize implementation changes.
Writing or running a test never expands the user's requested scope: in either mode, change product code only when the user also asked to build or fix it. Otherwise stop after producing the requested test evidence or verdict.

## Workflow

1. Establish the baseline:
   - Run the narrowest relevant existing checks before changing tests or code.
   - Record observed starting failures. Call a failure pre-existing only when a base revision, prior run, or other direct evidence proves that classification; a failure seen only in the current working tree has unknown provenance.
2. Design behavior evidence:
   - Prefer observable behavior through a public API, command, UI boundary, or other stable seam over private implementation details.
   - Cover the acceptance path plus material edge, error, and state-transition cases.
   - Derive expected values independently from the implementation under test; do not reproduce the same algorithm in the assertion.
3. Apply the selected mode:
   - In validation mode, run targeted checks and inspect whether they actually prove each acceptance criterion.
   - In TDD/regression mode, capture red-before-green evidence when practical. If product implementation is authorized, make the narrow change and observe green; otherwise leave the failing test or reproduction as the requested evidence. If the fix already exists or the old behavior cannot be run safely, state why a genuine red run was unavailable instead of fabricating one.
4. Use an executable fallback when appropriate:
   - If a durable automated test would be disproportionately brittle, slow, or expensive, use a focused script or real-system verification with deterministic inputs and observable assertions.
   - Explain the trade-off, capture the command and result, and remove temporary artifacts. Do not use a fallback merely to avoid a maintainable test.
5. Re-run and triage:
   - Run targeted checks first, then the full relevant suite.
   - Investigate failures and distinguish product defects, test defects, environment failures, and unrelated baseline failures.

## Output format (evidence required)

- Mode used and baseline result.
- Test strategy summary.
- Tests added/updated (files).
- In TDD/regression mode, red-before-green evidence or the reason it was not practical.
- Commands executed (exact) and results summary.
- Failures encountered and resolutions.
- Final gate status: `pass` or explicit blockers.

## Quality gate / halt conditions

- Any unresolved failing relevant test is a blocker.
- Skipped, flaky, or fallback-only coverage requires explicit rationale and its residual risk.
- Do not claim coverage from assertions coupled to private structure or expected values computed by the same logic under test.
