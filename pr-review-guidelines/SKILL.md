---
name: pr-review-guidelines
description: Code review rubric focused on correctness, maintainability, consistency, and evidence-backed approval gates.
---

# PR Review Guidelines

Use this skill to run a strict, evidence-based code quality review.

## When to use
- Reviewing a PR or local diff for merge readiness.
- Evaluating maintainability and consistency against repo conventions.
- Producing blocker-vs-suggestion findings with confidence levels.

## Inputs expected
- Diff or changed files.
- Relevant architecture/convention context.
- Validation evidence (commands run and results).

## Workflow
1. Validate evidence first:
- Confirm lint/build/test commands were run.
- If missing, request or run relevant checks before final approval.

2. Review by severity:
- Blockers: correctness defects, security issues, spec violations, build-breaking typing, major perf regressions.
- Warnings: maintainability, complexity, consistency, missing targeted coverage.
- Nits: stylistic or minor readability preferences.

3. Apply maintainability gate:
- Check naming clarity, abstraction boundaries, duplication, and cognitive load.
- Flag risky patterns and foot-guns that increase future change cost.

4. Produce actionable feedback:
- Include exact file/symbol references and concrete fix direction.
- Avoid vague guidance.

## Output format (evidence required)
- Review verdict: `approved` or `changes requested`.
- Commands executed (exact) and results summary.
- Findings:
  - Severity: `blocker|warning|nit`
  - Confidence: `0-100`
  - Why it matters
  - Suggested remediation
- Maintainability summary.

## Quality gate / halt conditions
- Halt approval if required validation evidence is missing.
- Halt approval for any blocker finding.
- Do not approve by weakening lint/test policy unless explicitly requested.
