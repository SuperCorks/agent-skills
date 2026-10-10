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
   - For UI changes, use `frontend-design` to review against applicable design criteria, source references, and rendered evidence. If context is missing or the skill is unavailable, establish the governing rules and comparable patterns directly from docs, code, and relevant pages. Respect authorized redesigns; report material design-criterion violations as `Spec` blockers and missing required visual evidence as a validation gap, not an invented defect. A source-only review must leave visual consistency explicitly unverified.
   - Include the affected user journey, relevant error/retry recovery, established workflow consistency, and semantic token usage in that UI review. Distinguish observed defects from UX hypotheses requiring research; do not make a full design-system audit or new user research a routine merge prerequisite.
4. Review engineering standards separately:
   - Check correctness, security, compatibility, maintainability, complexity, consistency, and targeted coverage.
   - Check what CI misses: feature-gate leaks (behavior meant to sit behind a flag or internal-only check becomes reachable without it) and broken developer workflow (changed secret sources, renamed or new required env vars, remapped ports, new mandatory setup steps; package-manager dependencies excluded).
   - Flag types that admit contradictory states (a boolean plus an optional timestamp), same-primitive arguments with different meanings, casts or non-null assertions not traced to a boundary parse, and non-exhaustive matches on a union.
   - Flag structural drift: a file pushed from under to over ~1,000 lines, ad-hoc conditionals bolted onto unrelated flows, one more branch on an existing conditional chain, a second flag that must stay in sync with another, and a new internal API that leaves the old path and its callers alive. Recommend splits by job, never by line count.
   - Flag needless code: dead code, unused options, speculative features, single-implementation abstractions, and custom code or new dependencies where the repo (name the path), platform, stdlib, or an installed dependency already covers it.
   - Judge scale against the expected load from the README or deploy config and state the load assumed: check-then-write races, per-process state that must be shared, a query per item, unbounded growth.
   - Targeted coverage means risky new logic (branch, parser, money, security, data write, bug fix) has a test that fails when it breaks; one good test, not a coverage number. A test that cannot fail for a defect (see `test-engineer`'s undefined-import check) is missing coverage.
   - For React changes, check the CRITICAL and HIGH rules in `react-best-practices` when that skill is available.
   - Label these findings `Standards` and tie them to repository conventions or concrete risk.
5. Inspect impact beyond changed lines:
   - Read affected callers, consumers, interfaces, configuration, persistence/migrations, and tests where they can change the conclusion.
   - When a signature, return value, or behavior changes, search every caller. Flag a fix applied in one caller while the shared function stays broken.
   - Use `change-impact-audit` when the change is high risk or its transitive effects cannot be bounded confidently during ordinary review.
6. Classify and report:
   - Report defects the change introduces. Mention pre-existing issues only when the change makes them reachable or worse, and do not report a high-risk change that is the branch's stated intent unless the author likely underweights it.
   - Every correctness finding needs a concrete case: this input leads to this wrong result. No case, no finding.
   - Finish the research before reporting when the code that would settle a finding is available, and trace a finding end to end before rating it a blocker.
   - Blockers include correctness defects, security issues, spec violations, build-breaking typing, and major performance or compatibility regressions.
   - Warnings cover material maintainability risk, complexity, consistency, and missing targeted coverage. Nits are non-blocking stylistic improvements.
   - Include exact file/symbol references, evidence, and concrete remediation; avoid vague guidance.

## Output format (evidence required)

- Review verdict: `approved` or `changes requested`.
- Comparison baseline: target/base/head identifiers plus the working-tree snapshot identity when applicable.
- Commands executed (exact) and results summary.
- Findings, numbered across severities so the user can reply "fix 2 and 5":
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
- Finish the independent review before reading existing bot or human PR threads; then validate, dedupe, and attribute any of their findings you include.
- Do not claim full impact coverage when relevant downstream consumers were not inspected; route deep or unbounded risk to `change-impact-audit`.
- Do not approve by weakening lint/test policy unless explicitly requested.
