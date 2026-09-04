---
name: frontend-design
description: Design, implement, redesign, refine, or review web interfaces. Use for frontend UI, UX, visual design, accessibility, design QA, and bounded browser verification; not for backend-only work.
---

# Frontend design

Create interfaces that are useful, specific to their subject, visually intentional, accessible, and proven in the running product. The user's brief and the product's established design system outrank this skill's preferences.

## Route the work

- New surface or substantial redesign: read [references/designing.md](references/designing.md).
- Critique, accessibility check, UX audit, or review-only request: read [references/reviewing.md](references/reviewing.md) and keep the work read-only.
- Narrow implementation or refinement: preserve the incumbent visual language. Read the designing reference only when material visual choices remain open.
- Implementation followed by QA: use the designing reference while building and the reviewing reference for the final pass.

## Ground the work

Before editing UI:

1. Inspect the relevant implementation, nearby components, design tokens, and any `PRODUCT.md`, `DESIGN.md`, screenshots, mockups, or references.
2. Identify the audience, primary job, content hierarchy, platform constraints, available assets, and whether the request is preservation, refinement, or replacement.
3. State important assumptions. Ask at most one blocking design question when plausible answers would produce materially different interfaces; otherwise proceed.
4. Use real product content and assets when available. Never invent claims, customers, metrics, data, or capabilities to make a design feel complete.

## Core standard

- Ground visual choices in the product's subject, audience, and operating context, not in current design trends.
- Give open-ended work one memorable idea. Spend visual boldness there and keep supporting elements disciplined.
- Treat typography, spacing, color, imagery, and motion as one system. Reuse established tokens and primitives.
- Make structure carry meaning. Cards, dividers, labels, badges, and decorative chrome must clarify hierarchy or state.
- Avoid template defaults without a brief-based reason: generic gradient heroes, interchangeable card grids, arbitrary groups of three, decorative all-caps labels, gratuitous glass, and uniform reveal animations.
- During refinement, preserve information architecture, routes, analytics hooks, factual copy, and recognizable brand elements unless the user authorizes changing them.
- Prefer the simplest implementation that delivers the intended experience and check existing dependencies before adding one.

## Implementation floor

Every changed surface must account for:

- native semantics, accessible names, keyboard operation, and visible focus;
- contrast, legible type, useful line length, and responsive reflow without clipping or accidental overflow;
- relevant loading, empty, error, disabled, success, and long-content states;
- purposeful motion with reduced-motion behavior;
- clear actions and feedback that follow the project's language, framework, components, and tokens.

Do not call a mockup production-ready when reachable states are intentionally out of scope. Name the gap instead.

## Verify in the running interface

When the UI can run:

1. Inspect representative desktop and narrow/mobile widths.
2. Exercise the primary interaction, keyboard path, and relevant state changes; check console output when available.
3. Review screenshots for hierarchy, rhythm, overflow, contrast, consistency, and unintended generic patterns.
4. Batch the fixes, then perform at most one focused confirmation pass.

If runtime verification is unavailable, use the strongest available evidence and name what remains unverified. For review work, use the verdict and blocker-first contract in [references/reviewing.md](references/reviewing.md).
