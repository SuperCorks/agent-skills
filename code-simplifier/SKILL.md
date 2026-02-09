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
1. Define invariants:
- Record behavior and public interface constraints to preserve.

2. Apply focused simplifications:
- Guard clauses for deep nesting.
- Extract clear helper functions.
- Improve local naming clarity.
- Remove safe dead code.

3. Validate equivalence:
- Run relevant tests/checks to verify behavior preservation.

## Output format (evidence required)
- What was simplified (before/after intent).
- Files changed.
- Behavior-preservation evidence (tests/validation).

## Quality gate / halt conditions
- Do not change business behavior or public APIs unless explicitly requested.
- Halt if required behavior cannot be validated with confidence.
