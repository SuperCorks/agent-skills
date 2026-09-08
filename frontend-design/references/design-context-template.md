# Design context templates

Use only the fields relevant to the task. Replace descriptions with verified sources and facts; do not carry illustrative component names or invented values into the implementation. The [existing-system procedure](existing-system.md) explains discovery, authority, and comparison.

## Per-task context

Keep this in the existing implementation plan or notes. A small edit may need only its reference, reuse choice, and focused check.

| Field | What to record |
| --- | --- |
| Mode and scope | Inherit, extend, or explore; affected area, theme, and retained constraints. |
| Governing sources | Applicable design decisions and docs, token/style sources, and any resolved conflict. |
| Comparable surfaces | Relevant routes, source files, stories, or screenshots; why they fit this task. |
| Reuse mapping | UI region or behavior → exact component/path, supported variant, and reference usage. Include shell and page composition. |
| Rules to preserve | Relevant hierarchy, gutters, spacing, density, action placement, responsive behavior, states, and terminology. |
| Extension or exception | Missing capability, evidence of the gap, proposed composition/extension, and affected consumers; omit if none. |
| Acceptance and evidence | Observable outcomes and source/runtime checks, including viewports and states; mark unavailable evidence. |

Example of the level of specificity, not a claim about any particular app: “The new list uses the named sibling's header composition, filter-toolbar placement, table density, pagination, and empty-state treatment. Only its domain-specific cell is new.” Pair such a statement with real routes, definitions, and verified APIs.

## Durable project reference

Extend existing project design docs. Create a short `DESIGN.md` index only when a durable reference is in scope and none exists. Keep app facts here rather than in the global skill; use the project's established documentation structure.

| Section | What to record |
| --- | --- |
| Scope and authority | Product area, brand/theme/platform, governing decisions, migration status, and explicit exceptions. |
| Foundations | Links to actual token, theme, shared-style, typography, icon, and motion sources; usage rules and known gaps. |
| Components | Definitions/imports, supported composition and variants, and maintained stories or call sites. |
| Page patterns | Reference routes and source paths for relevant list/detail/form/settings layouts, headers, actions, density, and responsive changes. |
| Behavior and content | References for loading, empty, error, validation, focus, feedback, and action vocabulary. |
| Evidence and freshness | For important rules: source, documented/inferred/conflicting/deprecated status, and last-verified date/revision. Recheck relevant sources on use. |
| Verification | Existing launch or verification instructions, representative viewports/states, evidence location, and reviewed visual baselines. |

Prefer links to current definitions over a second inventory of token values or component props. Update affected references when the system intentionally changes; do not canonize every newly observed implementation detail.
