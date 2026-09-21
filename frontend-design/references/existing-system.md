# Working within an existing design system

Use for new or changed UI in an existing product, whether its design rules are documented or mainly expressed in code and existing pages. A new route or a missing `DESIGN.md` does not open the visual direction by itself.

## Identify the governing sources

Start with explicit user direction and applicable product instructions. Find the design documentation, shared styles or tokens, component definitions, and maintained examples for the affected area. Verify the sources relevant to this task even when a previous design summary exists.

Resolve authority by scope and evidence:

- A maintained design decision or migration rule can intentionally supersede older screens. A working page does not automatically outrank documented intent, and a document is not automatically current because it exists.
- Use repeated comparable implementations to infer conventions where documentation is silent. Distinguish a documented rule, a corroborated inference, an unresolved conflict, and a deprecated or local exception.
- Match the product area, page purpose, theme, brand, platform, and migration state. Do not blend an admin app, marketing site, or legacy area into one supposed system.
- Treat starter screens and exploratory prototypes as candidate references, not established product rules without evidence of adoption.
- Follow a clear governing decision and record why. Ask only when a material conflict cannot be resolved from available evidence; absence of documentation alone is not a reason to stop.
- Preserve accessibility and functional requirements. Do not reproduce a defect merely because it appears in a reference.

## Discover enough context for this change

For a new page or substantial component, inspect a small relevant sample, usually two or three comparable surfaces when available: a sibling with the same job, its shell or shared layout, and a relevant state or interaction. For a tiny edit, inspect the affected component and its closest usage. Reuse current findings instead of repeating an app-wide audit.

Read implementations and inspect the running UI or existing screenshots when available. Identify the rules the requested change actually touches:

- **Page composition:** shell, content width and gutters, headers, title hierarchy, primary actions, toolbars, sections, table/form layout, and density.
- **Foundations and components:** shared styles or semantic tokens, typography roles, spacing, color, radii, elevation, icons, exact component APIs, variants, and composition conventions.
- **Behavior and content:** responsive changes, loading/empty/error states, validation, focus and overlays, disabled states, feedback, long content, and action terminology.

Read actual definitions and representative call sites or stories before relying on an import, prop, or variant. Use maintained Storybook, Figma mappings, or an internal registry when available and relevant; direct source and existing pages are sufficient without those integrations. A screenshot shows appearance, not the correct component API. A generic library example does not establish this app's conventions.

If the app has shared CSS but no token system, reuse its classes and patterns. Keep a missing token or primitive visible as a gap; do not turn a feature into an unrequested design-system migration. If visual evidence cannot be obtained, continue source discovery and name what remains unverified.

Choose tokens by their documented role and permitted scope, not just their current value. Trace aliases and relevant theme overrides when meaning is unclear: a border token does not become a surface token because both currently resolve to the same color. Follow the project's existing token model and deliberate exceptions; do not introduce token layers merely to satisfy a preferred architecture.

## Record the design context before implementation

For material UI work, add a concise record to the existing task plan or notes using the [per-task template](design-context-template.md#per-task-context): mode, governing sources and scope, comparable pages, reuse mapping, layout/behavior rules, necessary extensions, and observable acceptance criteria. Include verified paths or source links so another implementer or reviewer can follow them.

Capture relationships as well as tokens: for example, the new list page uses the same header hierarchy, content gutters, toolbar placement, table density, and narrow-screen behavior as the named sibling. Correct token usage alone does not prove correct page composition.

Keep durable project facts in the project's existing design documentation. If a durable reference is part of the task and none exists, use a short `DESIGN.md` index based on the [project template](design-context-template.md#durable-project-reference). Link it from existing project instructions when maintaining those instructions is in scope. Link to executable sources instead of copying every token value or prop. Record the verification date/revision and update facts affected by an intentional system change.

Do not require a new document or user approval ceremony for every UI edit. A routine task can keep its findings in its existing notes; a local observation does not automatically become a project-wide rule.

## Reuse, compose, then extend

Use the established shell, patterns, components, supported variants, and styles. Prefer composition of existing parts. If they cannot meet a real requirement, establish the missing capability and make the smallest appropriate extension within the authorized scope.

Before adding a primitive, variant, wrapper, icon package, or one-off style, check whether the capability already exists. Record the gap and reason for additions that introduce a new design choice; ordinary feature components composed from existing primitives are expected. Avoid unsupported overrides that make an existing component only superficially resemble the system.

When changing a shared component or token, inspect and verify representative existing consumers. Do not change global values solely to make one new page match its reference. Keep deliberate extensions and exceptions visible to review; explicit user direction can authorize a broader design change.

## Verify consistency

Use complementary evidence, scaled to the change:

1. **Source:** verify imports and APIs, supported variants, semantic token or shared-style usage, and any new overrides. Run relevant existing lint or component checks; do not weaken rules to pass or add infrastructure merely for a small edit.
2. **Rendered result:** compare the changed surface with its design reference at matching viewport, theme, and relevant state. Inspect hierarchy, composition, spacing, density, component treatment, responsive behavior, and interaction feedback. Record the routes/states/viewports and screenshots or other evidence used.

For an existing screen, inspect before/after evidence and use maintained visual regression tests when available. For a new screen, compare corresponding regions and behaviors with established examples; different pages and content are not whole-page pixel-diff targets. Review a new screen against its governing rules before adopting its first screenshot baseline. Never regenerate snapshots merely to accept an unexplained mismatch. Keep rendering environment, fonts, and fixture state consistent for automated comparisons.

Resolve material departures from the captured acceptance criteria or report them as unresolved using [the review contract](reviewing.md#severity-and-verdict). Personal preferences without a product rule or concrete usability basis remain suggestions. If runtime evidence is unavailable, report the reason and limit the conclusion to the checks performed; a successful build does not establish visual consistency.
