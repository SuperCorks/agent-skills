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
   - Run the narrowest relevant checks before editing. With no behavioral coverage, write a characterization or snapshot test before moving structure; a type check and lint are not a pin.
2. Evaluate each candidate:
   - Look first for a reframing that makes whole branches, helpers, modes, or layers disappear by using the existing architecture better; prefer deleting complexity to rearranging it. Propose cross-boundary restructures outside the requested scope instead of applying them.
   - Apply the deletion test: prefer removing dead code, redundant branches, or unnecessary layers over replacing them with another abstraction.
   - Apply the reader-load test: count indirection, concepts, and context switching introduced as well as lines removed. A shorter implementation is not simpler if it is harder to trace.
3. Simplify at the narrowest useful scope:
   - Favor clear control flow, local naming, guard clauses, and cohesive helpers.
   - Extract an abstraction only when it represents a stable concept or removes meaningful duplication/coupling. Reject forced abstractions that merely relocate code or combine coincidentally similar cases. Split by responsibility, never by line count.
   - Consider state machines, discriminated unions with an exhaustive `never` check, registries, indexes, or other domain structures only when they measurably eliminate invalid states, repeated branching, or duplicated business rules.
   - Shrink state scope: return values over mutation, locals over fields, fields over module state; derive values instead of syncing copies. A new reader should quickly answer "where does X come from?" and "what can change X?"
   - Validate at system boundaries (CLI args, config, network, external APIs) and remove deeper re-validation, defensive checks, or try/catch that the boundary already guarantees.
   - Replace custom code with an equivalent repo helper, stdlib, platform feature, or installed dependency; never add a dependency for a few lines.
   - For an internal API with no external consumers, migrate every caller and delete the old path in the same change; keep an adapter only with a stated removal condition. After renames, also search strings, docs, and config.
   - Comment pass: delete narration, banners, and commented-out code. Keep license headers, constraints forced by a dependency, platform, or protocol, public API docs, issue or RFC links, and pragmas. A comment explaining surprising behavior in our own code marks a rename, extraction, or type to add instead. Remove `any` casts that only silence the checker.
   - React: replace interacting boolean mode props with explicit variant components or `children` composition; do not add a context or provider for a single consumer.
4. Validate equivalence:
   - Re-run focused and full relevant checks and, when practical, exercise the affected public behavior.
   - For large reshapes, run an equivalence check that diffs old and new outputs on the same inputs.

## Output format (evidence required)

- What was simplified (before/after intent).
- Files changed.
- Behavior-preservation evidence (tests/validation).
- Deletions, indirection, or domain-structure trade-offs that materially informed the result.

## Quality gate / halt conditions

- Do not change business behavior or public APIs unless explicitly requested. Moved or merged code keeps its error handling and validation.
- Halt if required behavior cannot be validated with confidence.
- Do not introduce a shared abstraction or domain structure without a concrete reduction in invalid states, branching, duplication, or reader load.
- Revert any change that does not lower reader load somewhere.
- When committing, order commits as subtraction, then reshape, then cleanup.
