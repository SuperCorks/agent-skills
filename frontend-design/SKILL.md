---
name: frontend-design
description: Guidelines for creating distinctive, non-generic user interfaces. Focuses on typography, spatial layout, and avoiding "AI-generated" aesthetics.
---

# Frontend Design Guidelines

Use this skill when designing UI components or reviewing frontend code to ensuring the output is polished, distinctive, and accessible.

## Core Philosophy: Avoid "Generic AI" Aesthetic

AI-generated UIs often abuse rounded corners, excessive gradients, and standard colors (Tailwind blues/grays). To create distinctive software:

1.  **Typography Choices**:
    *   Avoid default pairings like Inter/Roboto unless mandated.
    *   Use distinct weights: ultra-bold headings vs. crisp, legible body text.
    *   Consider monospaced fonts for data-heavy or technical displays.

2.  **Spatial Design**:
    *   **Asymmetry**: Don't center everything. Use offset layouts to guide the eye.
    *   **Density**: Don't fear negative space, but avoid "loose" layouts where information density is too low.
    *   **Grid Breaking**: Occasionally break the grid for key elements to create visual interest.

3.  **Color & Backgrounds**:
    *   Avoid standard "skeleton loader" grays.
    *   Use subtle textures or noise instead of flat colors for large backgrounds.
    *   Ensure high contrast ratios (WCAG AA minimum).

## Interaction Patterns

*   **Feedback**: Every interactive element must have a `:hover` and `:active` state.
*   **Transitions**: Use fast transitions (100ms-200ms) for UI feedback. Avoid sluggish animations (>500ms) unless meaningful.
*   **Focus**: Custom focus rings are mandatory; never rely on browser defaults if they clash with the design, but ensure they are visible.

## Anti-Patterns (What to Avoid)

*   **The "Bootstrap Look"**: Generic 12-column grids with default border radii.
*   **Card Overload**: Not everything needs to be in a card with a shadow. Use whitespace and dividers.
*   **Inconsistent Spacing**: Stick to a rigid spacing scale (e.g., 4px, 8px, 16px, 24px).

## Verification Checklist

When reviewing a UI change:
- [ ] Does it look distinct from a standard library template?
- [ ] Are the interaction states (hover, focus, active) defined?
- [ ] Is the spacing consistent with the system?
- [ ] Is the typography hierarchy clear (size AND weight differences)?
- [ ] Are accessible names provided for icon-only buttons?
