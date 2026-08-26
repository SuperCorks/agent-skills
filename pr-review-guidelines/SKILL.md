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
- Target branch or explicit comparison baseline.
- Specification, acceptance criteria, or stated intent when available.
- Relevant architecture/convention context.
- Validation evidence (commands run and results).

## Workflow

1. Pin the review set:
   - Resolve and record the target ref, merge base or base SHA, and head SHA before inspecting changes.
   - When staged, unstaged, or untracked files are in scope, also capture the starting status and stable content identities for those changes. A head SHA alone does not identify a working-tree diff.
   - Recheck the same identifiers before the verdict. If the review set changed, identify the delta and review it or state that the verdict covers only the captured snapshot.
2. Validate evidence:
   - Confirm relevant lint, build, and test commands were run. If missing, request or run the checks before final approval.
3. Review specification compliance separately:
   - Compare observable behavior with the stated requirements and acceptance criteria.
   - Label these findings `Spec`; do not turn unstated preferences into requirements.
4. Review engineering standards separately:
   - Check correctness, security, compatibility, maintainability, complexity, consistency, and targeted coverage.
   - Label these findings `Standards` and tie them to repository conventions or concrete risk.
5. Inspect impact beyond changed lines:
   - Read affected callers, consumers, interfaces, configuration, persistence/migrations, and tests where they can change the conclusion.
   - Use `change-impact-audit` when the change is high risk or its transitive effects cannot be bounded confidently during ordinary review.
6. Classify and report:
   - Blockers include correctness defects, security issues, spec violations, build-breaking typing, and major performance or compatibility regressions.
   - Warnings cover material maintainability risk, complexity, consistency, and missing targeted coverage. Nits are non-blocking stylistic improvements.
   - Include exact file/symbol references, evidence, and concrete remediation; avoid vague guidance.

## Output format (evidence required)

- Review verdict: `approved` or `changes requested`.
- Comparison baseline: target/base/head identifiers plus the working-tree snapshot identity when applicable.
- Commands executed (exact) and results summary.
- Findings:
  - Category: `Spec|Standards`
  - Severity: `blocker|warning|nit`
  - Confidence: `0-100`
  - Evidence and affected behavior
  - Why it matters
  - Suggested remediation
- Maintainability summary.

## Quality gate / halt conditions

- Halt approval if required validation evidence is missing.
- Halt approval for any blocker finding.
- Do not claim full impact coverage when relevant downstream consumers were not inspected; route deep or unbounded risk to `change-impact-audit`.
- Do not approve by weakening lint/test policy unless explicitly requested.
