# Designing and redesigning interfaces

Use this reference when the visual direction is materially open.

## Read the brief

Capture the audience, primary outcome, brand traits, tone, existing assets, visual references, density, accessibility, localization, performance, and platform constraints. Identify incumbent patterns that must survive and patterns the user wants replaced.

Classify the surface by its job; these are priorities, not visual styles:

- **Persuade:** marketing, pricing, campaign, or landing surface. Earn attention and action with real proof.
- **Operate:** application, dashboard, editor, admin, form, or settings surface. Optimize task completion, scanability, and state visibility.
- **Read:** documentation, article, guide, or help surface. Optimize finding and understanding information.
- **Experience:** portfolio, gallery, or showcase. Let the work lead and the interface recede.

If one reasonable interpretation of an incomplete brief dominates, state it and continue. Ask one focused question only when the answer would change the core direction.

## Decide what survives

- **Refine:** preserve identity, content, behavior, tokens, and component conventions. Improve hierarchy, rhythm, clarity, responsiveness, and craft within the system.
- **Redesign:** preserve product truth, functions, durable content, and platform expectations, then choose a coherent replacement visual world. Avoid a half-old, half-new compromise.
- **New surface:** inherit the product's established system when one exists. A missing `DESIGN.md` is not proof that no system exists.

Before redesigning, record navigation, conversion or task paths, brand assets, tokens, responsive behavior, accessibility wins, analytics-sensitive identifiers, and SEO-sensitive routes. Do not change them silently.

## Form a direction before coding

Define:

1. **Concept:** one sentence connecting the visual idea to the product and audience.
2. **Palette:** a small set of semantic roles with concrete values.
3. **Typography:** families, roles, scale, weight, line-height, and intended measure.
4. **Layout:** composition, alignment, density, and responsive collapse. Use a small ASCII wireframe when the spatial relationship is not obvious.
5. **Signature:** one memorable element or interaction and why it belongs.
6. **Restraint:** what stays quiet or is omitted.

Replace any choice that could be pasted unchanged into an unrelated product.

## Use systems and assets deliberately

- Prefer the project's component library and tokens. If an official design system governs the product, use its supported packages and conventions.
- Do not mix systems with conflicting tokens or interaction models without a concrete integration reason.
- Confirm a dependency exists before importing it.
- Use provided, legitimately sourced, or generated imagery when it carries the concept. Do not fake product screenshots, logos, customer marks, or data.
- Mark intentional placeholders clearly; do not let them read as factual product claims.

## Catch model defaults

Treat these as warning signs, not universal bans:

- a centered headline, short subhead, two buttons, and decorative gradient regardless of subject;
- identical rounded cards for every content type;
- one font, radius, shadow, and spacing treatment applied without hierarchy;
- all-caps eyebrows, numbering, arrows, pills, or monospace metadata that encode nothing;
- purple-blue glow, warm-paper editorial styling, or black-and-acid accent without brand evidence;
- repeated fade-and-slide entrances or hover motion on every element;
- oversized type that wraps badly, clips, or pushes the primary action below the first viewport;
- fake precision, testimonials, companies, or decorative dashboards with invented data.

Return to the subject instead of selecting a different preset.

## Build complete behavior

- Use grid, flex, intrinsic sizing, or container queries rather than brittle viewport heights and arithmetic widths.
- Make controls work through pointer and keyboard input. Prefer platform conventions to invented gestures.
- Design realistic loading, empty, error, disabled, success, overflow, and long-content states.
- Tie motion to orientation, feedback, continuity, or hierarchy; respect reduced motion and clean up animation resources.
- Keep action names consistent across controls, dialogs, status messages, and notifications.

## Finish with bounded visual QA

Render representative desktop and mobile states together when possible. Inspect once, batch fixes, and confirm once. Stop when the requested outcome and quality floor are met.
