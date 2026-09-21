---
name: design-system-audit
description: Audit design-system foundations, component usage, documentation, and design/code drift with prioritized, evidence-backed recommendations. Use for a system health audit or AI-readiness assessment, not routine UI implementation or a single-screen UX review.
---

# Design system audit

Assess whether a product's design system provides coherent, usable rules for people and agents. Deliver a concise prioritized report with evidence and affected consumers. Keep the audit read-only apart from requested report artifacts; recommendations do not authorize migrations or changes to code, design libraries, tokens, or documentation.

## Establish scope and authority

- Identify the product area, platform, brands/themes, and active migrations. Keep intentionally distinct systems separate.
- Find governing decisions, token/theme sources, component definitions, maintained stories, design files, and representative product flows. Resolve authority using scope and freshness; distinguish documented rules, corroborated conventions, conflicts, and deliberate exceptions. Repeated implementation is not proof that a defect should be preserved.
- Record the inspected revision or date and relevant starting changes. Name unavailable sources. Code and existing documentation are sufficient to begin; Figma, Storybook, analytics, and MCP integrations are optional evidence, not prerequisites.
- State whether coverage is comprehensive or sampled. For sampling, identify the inspected components, consumers, themes, states, and viewports and why they represent the scope. Do not extrapolate counts or claim full-system coverage from a sample.

## Inspect the foundations

Follow a few representative rules from their definition through components to rendered consumers. Investigate broader patterns when the evidence warrants it.

| Area | What to establish |
| --- | --- |
| Tokens and themes | Trace primitive, semantic, and component aliases where present. Check meaning and permitted scope, broken references, theme overrides, hard-coded values, and conflicting sources of truth. A border token used for a surface can be wrong even when the current colors match. Equal values do not establish interchangeable meanings. Follow the project's token model rather than requiring every layer. |
| Components and variants | Check actual definitions and usage for overlapping responsibilities, unsupported overrides, inconsistent states, and variants with no demonstrated need. Similar appearance alone does not prove duplication; different semantics, accessibility behavior, or consumers can justify separate components. Confirm references before calling a component or token unused. |
| Design/code parity | Compare corresponding components, variants, and token bindings in available design and code sources. Inspect detached instances or raw design values when available. If one side is unavailable, report parity as unverified rather than asserting drift. |
| Rendered behavior | Compare representative consumers at matching theme, state, and viewport. Check composition, responsive behavior, accessibility, loading/error states, and focus as well as visual styling. Source checks cannot establish rendered consistency or accessibility conformance. |
| Documentation and decisions | Check that usage guidance explains when to use a component, supported composition/variants, states, and relevant exceptions. Verify examples against current APIs. Look for discoverable decisions with rationale, scope, date, and supersession status; recommend filling consequential gaps rather than logging every minor choice. |
| Delivery and maintenance | Trace any existing token transformation/export pipeline to its consumers. Check reproducibility, stale generated artifacts, ownership of shared changes, deprecation/migration guidance, and existing lint/component/visual checks. Judge missing infrastructure by demonstrated risk, not by whether a preferred tool is installed. |

Use existing checks where helpful. Keep scratch output outside source directories and avoid updating snapshots or generated assets during an audit. Browser verification should use safe fixtures and avoid actions with real-world effects. Record any runtime access limits and the resulting uncertainty.

## Separate evidence from hypotheses

- Tie each defect to a governing rule, reproducible failure, or concrete consumer impact. Hard-coded values are investigation candidates, not automatic defects; legitimate exceptions and products without tokens need contextual judgment.
- Keep observed UX problems separate from hypotheses about user confusion, conversion, or adoption. Existing research, support feedback, or analytics can strengthen a conclusion when available and relevant. Do not invent user evidence or causal explanations from metrics alone.
- Use `frontend-design` for deeper review of a specific journey or screen when available; otherwise inspect task completion, accessibility, consistency, and recovery directly. Do not turn the system audit into an unsolicited redesign.

## Prioritize and report

Lead with a short summary of the system's condition and the most useful next actions; keep detailed evidence in an appendix when needed. Include:

- **Coverage:** sources and revision/date, sampled or comprehensive scope, inspected consumers/themes/states, and unavailable evidence.
- **Findings in priority order:** observed problem, governing rule or user impact, exact file/symbol or design-node reference, runtime state when relevant, affected consumers, and confidence. Deduplicate symptoms with a shared cause.
- **Recommended action:** smallest useful correction, expected benefit, migration risk, and how to verify it across affected consumers. Separate urgent usability/accessibility failures from maintenance improvements and research hypotheses.
- **Sound foundations and open questions:** what can be retained and what evidence would resolve uncertainty.

Do not claim the system is ready for every AI workflow or quantify savings without evidence. Keep implementation or migration proposals bounded and separately scoped; an audit is complete when its requested coverage and evidence-backed recommendations are delivered.
