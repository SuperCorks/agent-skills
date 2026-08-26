---
name: code-simplifier
description: Behavior-preserving refactor workflow for reducing complexity and improving readability.
---

# Code Simplifier

## When to use

- Refactoring for readability/maintainability without feature changes.
- Reducing nesting, duplication, and cognitive load in localized areas.

## Inputs expected

- Target files/functions and refactor scope.
- Existing tests or validation commands.

## Workflow

1. Define invariants and baseline evidence:
   - Record behavior, public interfaces, side effects, and compatibility constraints to preserve.
   - Run the narrowest relevant checks before editing.
2. Evaluate each candidate:
   - Apply the deletion test: prefer removing dead code, redundant branches, or unnecessary layers over replacing them with another abstraction.
   - Apply the reader-load test: count indirection, concepts, and context switching introduced as well as lines removed. A shorter implementation is not simpler if it is harder to trace.
3. Simplify at the narrowest useful scope:
   - Favor clear control flow, local naming, guard clauses, and cohesive helpers.
   - Extract an abstraction only when it represents a stable concept or removes meaningful duplication/coupling. Reject forced abstractions that merely relocate code or combine coincidentally similar cases.
   - Consider state machines, discriminated unions, registries, indexes, or other domain structures only when they measurably eliminate invalid states, repeated branching, or duplicated business rules.
4. Validate equivalence:
   - Re-run focused and full relevant checks and, when practical, exercise the affected public behavior.

## Output format (evidence required)

- What was simplified (before/after intent).
- Files changed.
- Behavior-preservation evidence (tests/validation).
- Deletions, indirection, or domain-structure trade-offs that materially informed the result.

## Quality gate / halt conditions

- Do not change business behavior or public APIs unless explicitly requested.
- Halt if required behavior cannot be validated with confidence.
- Do not introduce a shared abstraction or domain structure without a concrete reduction in invalid states, branching, duplication, or reader load.
