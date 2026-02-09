---
name: frontend-design
description: UX and accessibility review guidance for distinctive, usable interfaces with explicit blocker-first output.
---

# Frontend Design and UX Review

Use this skill for design-focused frontend QA with concrete a11y and consistency criteria.

## When to use
- Reviewing frontend changes for usability, consistency, and accessibility.
- Designing or refining UI while preserving established system patterns.
- Producing action-oriented UX findings for implementation.

## Inputs expected
- Changed UI files/components and expected behavior.
- Existing design system/pattern constraints.
- Any provided references (screenshots, mockups, Figma links).

## Workflow
1. Semantics and structure:
- Validate correct element usage (buttons vs links, heading hierarchy, landmarks).

2. Interaction behavior:
- Verify hover/focus/active states and keyboard navigation.
- Ensure visible focus indicators.

3. Accessibility checks:
- Labels, accessible names, alt text, and necessary ARIA usage.
- Ensure error/empty/loading states are understandable.

4. Visual consistency:
- Confirm spacing/typography/tokens align with existing system.
- Flag generic/boilerplate UI patterns that reduce clarity.

## Output format (evidence required)
- Summary verdict: `pass` or `needs changes`.
- Blockers first:
  - What is wrong
  - Criterion violated (a11y/semantics/consistency/usability)
  - Concrete fix
- Non-blocking suggestions (explicitly marked).

## Quality gate / halt conditions
- Halt with `needs changes` for accessibility blockers or broken keyboard/focus behavior.
- Do not propose unrelated redesigns unless explicitly requested.
