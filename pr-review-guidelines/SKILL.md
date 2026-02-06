---
name: pr-review-guidelines
description: Rubrics and standards for conducting high-quality code reviews, including scoring and classification.
---

# PR Review Guidelines

Use this skill to assess code quality objectively and provide actionable feedback.

## Classification: Blocker vs. Nit

Distinguish clearly between critical issues and optional suggestions.

### 🔴 BLOCKER (Must Fix)
*   **Bugs**: Code that will definitely fail or produce incorrect results.
*   **Security Risks**: Any vulnerability from the `security-guidance` list.
*   **Spec Violation**: Code that does not do what the user asked.
*   **Performance**: O(n²) or worse operations on potentially large datasets.
*   **Typing**: Code that breaks the build (TS errors).

### 🟡 WARNING (Should Fix)
*   **Code Style**: Inconsistent naming or formatting (if not auto-fixable).
*   **Complexity**: Logic that is hard to read but correct.
*   **Test Coverage**: specific logic paths missing tests.

### 🟢 NIT (Optional)
*   **Preference**: "I prefer `map` over `loops` here."
*   **Comments**: Typos in comments or variable names.
*   **Optimization**: Micro-optimizations that don't materially affect performance.

## Confidence Scoring (0-100)

When reporting an issue, assess your confidence:

*   **90-100 (Certainty)**: syntax errors, obvious crashes, known security sinks. Report immediately.
*   **70-89 (Likely)**: logic that looks wrong but might depend on external context not visible. Report with "This seems to..."
*   **0-69 (Uncertain)**: Avoid reporting unless asking a clarifying question. False positives waste user time.

## Review Quality Standards

1.  **Be specific**: Don't say "Fix this." Say "This variable is undefined on line 42 because..."
2.  **Provide samples**: When suggesting a fix, provide the code snippet.
3.  **Check the "Why"**: Don't just check syntax; check if the business logic makes sense.

## Review Checklist

- [ ] Does the code work? (Correctness)
- [ ] Is it safe? (Security)
- [ ] Is it readable? (Maintenance)
- [ ] Does it fit the architecture? (Design)
