---
name: frontend-design
description: Design, implement, refine, or review web interfaces, including new pages and components in an existing app. Preserve established design systems and page patterns unless redesign is requested. Use for UI, UX, accessibility, and visual QA; not for backend-only work.
---

# Frontend design

Create interfaces that are useful, specific to their subject, visually intentional, accessible, and proven in the running product. The user's brief and the product's established design system outrank this skill's preferences.

## Route the work

- **Inherit** is the default for changes within an existing product, including new pages and components. Read [references/existing-system.md](references/existing-system.md) to identify and apply its documented or implicit system.
- **Extend** when a required pattern is missing: use the same existing-system reference to establish the gap and fit the addition into the product.
- **Explore** when the brief opens the visual direction, such as a new product or an explicitly requested redesign: read [references/designing.md](references/designing.md). Preserve any constraints the brief retains.
- For planning, use the applicable mode to gather design context and define future verification. Read-only discovery for a plan is not a review deliverable; do not assign a pass/fail verdict to unimplemented UI.
- Critique, accessibility check, UX audit, or review-only request: read [references/reviewing.md](references/reviewing.md) and keep the work read-only.
- Scale discovery to the change: a small edit needs its affected component and closest usage, not a fresh app inventory.
- Implementation followed by QA: use the relevant mode while building and the reviewing reference for the final pass.

## Ground the work

Before editing UI:

1. Inspect the relevant implementation, nearby components, design tokens, and any `PRODUCT.md`, `DESIGN.md`, screenshots, mockups, or references.
2. Identify the audience, primary job, content hierarchy, platform constraints, available assets, and applicable mode.
3. Before material UI edits, record the governing sources, comparable surfaces, verified components and variants to reuse, applicable layout and behavior rules, and any necessary extension in the task's existing plan or notes. Turn these into observable acceptance criteria; use the [design context templates](references/design-context-template.md) when useful.
4. State important assumptions. Ask only when an unresolved conflict would materially change the interface; continue when the evidence supports a choice. This design record does not add an approval step to already authorized work.
5. Use real product content and assets when available. Never invent claims, customers, metrics, data, or capabilities to make a design feel complete.

## Core standard

- Ground visual choices in the product's subject, audience, and operating context, not in current design trends.
- In explore mode, give open-ended work one memorable idea. Spend visual boldness there and keep supporting elements disciplined.
- Treat typography, spacing, alignment, color, imagery, and motion as one system. Reuse established tokens and primitives.
- Make alignment deliberate: choose the relevant edge, centerline, or text baseline; optically center labels, icons, and media inside buttons and similar controls; do not assume default flex or line-height behavior looks aligned.
- Make spacing communicate relationships: keep items within a group closer than separate groups, and preserve clear, consistent separation between sibling components, sections, and a section title and its content.
- Make structure carry meaning. Cards, dividers, labels, badges, and decorative chrome must clarify hierarchy or state.
- Avoid introducing template defaults without a product- or brief-based reason: generic gradient heroes, interchangeable card grids, arbitrary groups of three, decorative all-caps labels, gratuitous glass, and uniform reveal animations. These preferences do not override established product conventions.
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
3. Compare the result with the governing design reference for hierarchy, alignment, spacing and grouping, density, overflow, contrast, and states. For existing products, use the [comparison procedure](references/existing-system.md#verify-consistency).
4. Batch the fixes, then perform a focused confirmation pass. Repeat only for new failures or unresolved acceptance criteria; stop once the requested outcome and quality floor are met.

If runtime verification is unavailable, use the strongest available evidence and name what remains unverified. For review work, use the verdict and blocker-first contract in [references/reviewing.md](references/reviewing.md).
