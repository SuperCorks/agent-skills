---
name: html-plan
description: Create reviewable, self-contained HTML planning artifacts for implementation, QA, rollout, design, data, compliance, architecture, or handoff work. Use when the user asks for a plan, phased plan, implementation plan, QA plan, rollout plan, architecture plan, detailed instructions, or explicitly asks to write/build an HTML plan file.
---

# HTML Plan

Create a durable planning artifact that turns messy source context into a decision-ready implementation, QA, rollout, or handoff map.

## Workflow

1. Classify the plan type:
- Frontend/design/product
- Data/QA/analytics
- Integration/API
- Rollout/deployment
- Compliance/research
- Architecture/platform

2. Gather source context before writing:
- Read relevant repo docs, existing plans, code paths, tests, config, and deployment files.
- Inspect sibling or reference implementations when the user names them.
- For plans that change product UI, use `frontend-design` to identify the governing design sources, comparable surfaces, and reusable components and page patterns before drafting. If unavailable, inspect the project docs, source, and relevant existing pages directly. New pages inherit the applicable product system unless redesign is requested.
- Use named external context tools when available and relevant, such as Figma, Slack, browser, Computer Use, Gmail/Drive, PostHog, admin dashboards, or analytics tools.
- Check branch/worktree state only when sequencing, PR, deploy, or handoff details depend on it.
- If a source is inaccessible, record exactly what was unavailable and continue with clearly labeled assumptions.

3. Harden assumptions before drafting:
- Clarify scope, non-goals, constraints, and authority boundaries when they affect the plan.
- Use `requirements-interview` when available and unresolved decisions would materially change the plan. With substantial context, propose an evidence-grounded understanding for correction; otherwise ask the highest-impact question. Investigate factual questions before routing them to the user, and stop when further answers would not change the plan.
- Preserve the source and status of consequential claims in the assumptions or decisions section: distinguish user decisions, observed behavior, documented or researched facts, and agent inferences. Explain the consequence if wrong and the boundary of any deliberate deferral. Use a compact table only when several claims warrant it; do not create a separate ledger artifact.

4. Write the HTML artifact with `html-report-builder`:
- Prefer `docs/plans/<yyyy-mm-dd-topic>.html` inside a repo.
- If no repo docs location is obvious, use a local `outputs/` folder in the current workspace.
- Load the `html-report-builder` skill and start from its `assets/templates/plan.html`. Use only the classes in its `references/components.md` and follow its `references/writing.md`. Write no CSS or JavaScript except mockup styles scoped to `.mock-*` classes; the builder inlines the shared runtime.
- Put open questions and recommended decisions immediately after scope so the reviewer sees decision needs before reading the full plan.
- Include concrete paths, commands, links, identifiers, source names, and open decisions so a future agent can execute from the plan.
- Link question cards to the relevant detail sections by their section ids.
- Run `node <html-report-builder>/scripts/report.mjs build <file>` and fix every error.
- If `html-report-builder` is not installed, write one self-contained HTML file by hand instead: embedded CSS, no external runtime dependencies, clear headings, compact cards and tables, responsive and print-friendly layout, and stable `id` anchors on major sections.

5. Verify and hand off:
- Confirm `report.mjs build` (or `check`) passes.
- When a browser tool is available, view the plan at about 1280 px and 390 px wide and check the console.
- Offer the builder's local editor for review (`node <html-report-builder>/editor/report-editor.mjs <file>`): the reader can fix wording, answer question cards, and rewrite sections with AI directly in the file.
- Do not change implementation code unless the user explicitly asks for implementation.
- Respond with the artifact path, recommendation summary, top open decisions, and whether the plan is ready for implementation.
- When revising an existing plan, run `report.mjs outline <file>` first, edit only the affected sections, keep question ids stable, fold in any answers the reader recorded, and rebuild.

## Required Sections

Every HTML plan should include these sections (the `plan` template's section id is in parentheses):

- Title and one-paragraph north star (hero), with an optional at-a-glance summary (`summary`).
- Scope, non-goals, assumptions, and authority boundaries (`scope`).
- Open questions and recommended decisions immediately after scope (`questions`).
- Sources reviewed with links or local paths (`sources`).
- Current state or current gap (`current`).
- Target behavior or desired outcome (`target`).
- Recommended path and alternatives considered (`target`, or an `options` block where it fits).
- Phases or workstreams, with sequential versus parallelizable work marked (`phases`).
- Data/content model impact, when applicable (`architecture`).
- Environment/config/deployment impact, when applicable (`rollout`).
- QA/validation matrix (`qa`).
- Acceptance criteria and definition of done (`acceptance`).
- Risks and mitigations (`risks`).
- Implementation handoff summary (`handoff`).

## Question Section Requirements

Place open questions near the top of the document, directly after the scope section and before deep source/current-state detail. Each question should be understandable without reading the full plan first.

Use the builder's question card (`<article class="question" id="q1">`), numbered `q1`, `q2`, ... in document order so the reader can answer in a batch. For each question or decision card, include:

- A specific question title written as a complete sentence ending in a question mark, never a fragment such as "Hosting?".
- A short context paragraph explaining what the decision affects and why it matters.
- A recommended default or proposed answer when there is enough evidence.
- Links to the relevant sections for more detail, such as `#current`, `#target`, `#ux`, `#architecture`, `#qa`, `#rollout`, or another plan-specific anchor.
- A clear owner or decision maker when known.
- An empty `.answer` slot for the reader's answer.

The table of contents follows section order, so keeping `questions` right after `scope` also places it right after Scope in the navigation.

## Type-Specific Additions

For frontend, design, or product plans, include:

- Figma/design references, node IDs, screenshots, or current/target comparisons when available.
- A concise design context and reuse mapping: governing sources, reference routes/files, verified components and variants, layout/behavior rules, and justified extensions. Distinguish documented rules from inference and unresolved conflicts. Make mockups follow this context and include source checks and rendered comparison criteria in the implementation handoff.
- Embedded HTML mockups or prototypes by default for any plan with a meaningful frontend, dashboard, or product UI surface, inside the builder's `.device` phone or desktop frames and styled with the product's own design language. Use low-fidelity wireframes when final visuals are unknown. Skip only when the user explicitly declines visuals or the plan is purely non-UI.
- Before/after comparisons (`.compare`) that compare like with like: mobile with mobile, the same region at the same size, with sharp screenshots.
- UX behavior, states, responsive behavior, empty/error/loading cases, and URL parameter behavior.
- Content and data-model requirements per feature.
- UI acceptance criteria precise enough for visual QA.
- Ask if screenshots are needed.
- Ask whether the mockups should be high fidelity when that choice materially changes the work.

For data, QA, analytics, or dashboard plans, include:

- Source-of-truth matrix covering warehouse tables and platform/admin reports.
- Raw data queries or exact query locations.
- Card, chart, metric, page, and filter-by-filter QA matrix.
- Previous-period reconciliation and source-platform comparison.
- Known caveats, tolerances, and thresholds.
- Final report template or expected evidence format.

For rollout or deployment plans, include:

- Environment matrix for local, dev, staging, preview, and production.
- Env vars, secrets, flags, and where each must be configured.
- Migration, backfill, data repair, or cache invalidation steps.
- Smoke tests, rollback plan, PR/deploy notes, and release sequencing.

For compliance or research plans, include:

- Jurisdiction, policy, and assumption boundaries.
- Evidence sources and confidence level.
- Options with trade-offs instead of generic legal boilerplate.
- Clear decisions the user or counsel must make.

For integration, API, or architecture plans, include:

- System boundaries, data flow, ownership, and failure modes.
- API contracts, webhook/event names, identifiers, and idempotency rules.
- Security, privacy, rate-limit, and observability considerations.
- Migration and compatibility notes.

## Correction Prevention Checklist

Before finalizing the plan, check that it does not repeat common failure modes:

- Scope is not too narrow or generic.
- Named source tools and references were actually used or marked inaccessible.
- Data/content model implications are included where relevant.
- Compliance assumptions are explicit.
- Environment, deploy, preview, rollback, and config details are covered.
- Frontend, dashboard, or product plans include embedded mockups/prototypes or clearly explain why visuals were intentionally skipped.
- UI details are testable rather than vague.
- Source-of-truth comparisons go beyond warehouse data when platform reports matter.
- Plan-only requests did not result in implementation changes.
- The plan follows the builder's `references/writing.md`: decision-relevant phrases in bold, key content not collapsed, company and product named precisely, and no internal provenance in client-facing plans.
- `report.mjs build` passes with no errors.

As you get corrected through the plan, ask if this skill document should get updated to prevent future corrections (if applicable and not too specific to the current plan).
