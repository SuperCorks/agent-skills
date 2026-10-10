---
name: test-engineer
description: Baseline-first testing workflow for correctness, regression safety, before/after claim verification, and evidence-backed test reporting.
---

# Test Engineer

## When to use

- Validating implementation against acceptance criteria.
- Driving a behavior change or protecting a reproduced defect with tests.
- Proving or disproving a specific claim, such as "this fixes the bug" or "this is faster".

## Inputs expected

- Intended behavior, acceptance criteria, the reproduced defect, or the claim to check.
- Implementation diff and changed files when an implementation already exists.
- Existing test framework conventions.
- Authorization to change product code when the task includes implementation or a fix.

## Choose a mode

- **Validation mode:** assess an existing implementation against acceptance criteria and relevant regressions.
- **TDD/regression mode:** define a new behavior or reproduced defect at a stable public seam, observe the test fail, then implement or verify the fix.
- **Claim mode:** prove or disprove one stated claim with baseline and treatment evidence from the same setup.

Use only the mode the request needs. A validation task does not automatically authorize implementation changes.
Writing or running a test never expands the user's requested scope: in any mode, change product code only when the user also asked to build or fix it. Otherwise stop after producing the requested test evidence or verdict.

## Workflow

1. Establish the baseline:
   - Run the narrowest relevant existing checks before changing tests or code.
   - Record observed starting failures. Call a failure pre-existing only when a base revision, prior run, or other direct evidence proves that classification; a failure seen only in the current working tree has unknown provenance.
2. Design behavior evidence:
   - Prefer observable behavior through a public API, command, UI boundary, or other stable seam over private implementation details.
   - Cover the acceptance path plus material edge, error, and state-transition cases.
   - Derive expected values independently from the implementation under test; do not reproduce the same algorithm in the assertion.
   - Before keeping a test, ask whether it would still pass if every function it imports returned undefined; if so, strengthen the assertion or delete the test. Warning signs: only weak assertions (`toBeDefined`, `toBeTruthy`, `not.toThrow`), only "mock was called", restating a hand-maintained constant, or asserting fixture data the subject never touched. Assert a literal output or the payload a mock received.
3. Apply the selected mode:
   - In validation mode, run targeted checks and inspect whether they actually prove each acceptance criterion.
   - In TDD/regression mode, capture red-before-green evidence when practical, and confirm red fails for the intended reason before touching product code. If product implementation is authorized, make the narrow change and observe green; otherwise leave the failing test or reproduction as the requested evidence. If the fix already exists or the old behavior cannot be run safely, state why a genuine red run was unavailable instead of fabricating one. When committing, commit the failing test before the fix so history shows red then green.
   - In claim mode, restate the claim falsifiably (condition, metric, threshold). Capture baseline and treatment with the same command, data, and environment, compare the raw artifacts, and return exactly one verdict: `VERIFIED` (moved in the predicted direction by the threshold, no obvious confound), `NOT VERIFIED` (unchanged, wrong direction, or under threshold), or `INCONCLUSIVE` (no valid baseline, noisy signal, or an environment difference). Do not soften a negative result.
4. Use an executable fallback when appropriate:
   - If a durable automated test would be disproportionately brittle, slow, or expensive (it would mostly test mocks, encode implementation details, depend on timing or global state, or need heavy infrastructure for a small fix), do not add it; use a focused script or real-system verification with deterministic inputs and observable assertions.
   - Explain the trade-off, capture the command and result, and remove temporary artifacts. Do not use a fallback merely to avoid a maintainable test.
5. Re-run and triage:
   - Run targeted checks first, then the full relevant suite.
   - Investigate failures and distinguish product defects, test defects, environment failures, and unrelated baseline failures.

## Output format (evidence required)

- Mode used and baseline result.
- Test strategy summary.
- Tests added/updated (files).
- In TDD/regression mode, red-before-green evidence or the reason it was not practical.
- In claim mode, the falsifiable claim; baseline, treatment, delta, and threshold for each metric or artifact; one paragraph naming the evidence and any confounds; and the verdict.
- Commands executed (exact) and results summary.
- Failures encountered and resolutions.
- Final gate status: `pass` or explicit blockers (claim mode reports its verdict instead).

## Quality gate / halt conditions

- Any unresolved failing relevant test is a blocker.
- Skipped, flaky, or fallback-only coverage requires explicit rationale and its residual risk. Make a flaky reproduction deterministic before relying on it.
- Do not claim coverage from assertions coupled to private structure or expected values computed by the same logic under test.
- Do not weaken existing assertions unless the expected behavior changed.
