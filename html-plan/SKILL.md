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
- Use named external context tools when available and relevant, such as Figma, Slack, browser, Computer Use, Gmail/Drive, PostHog, admin dashboards, or analytics tools.
- Check branch/worktree state only when sequencing, PR, deploy, or handoff details depend on it.
- If a source is inaccessible, record exactly what was unavailable and continue with clearly labeled assumptions.

3. Harden assumptions before drafting:
- Clarify scope, non-goals, constraints, and authority boundaries when they affect the plan.
- Ask as many focused questions as needed to harden assumptions and resolve meaningful unknowns.
- If a question-asking skill or tool is available, use it when questions would materially improve the plan.

4. Write a self-contained HTML artifact:
- Prefer `docs/plans/<yyyy-mm-dd-topic>.html` inside a repo.
- If no repo docs location is obvious, use a local `outputs/` folder in the current workspace.
- Embed CSS in the file. Do not require external runtime dependencies.
- Favor reviewability over decoration: clear headings, compact cards and tables, readable typography, responsive layout, and print-friendly structure.
- Include concrete paths, commands, links, identifiers, source names, and open decisions so a future agent can execute from the plan.

5. Verify and hand off:
- Confirm the file exists and is readable.
- Open it or inspect its first lines when practical.
- Do not change implementation code unless the user explicitly asks for implementation.
- Respond with the artifact path, recommendation summary, top open decisions, and whether the plan is ready for implementation.

## Required Sections

Every HTML plan should include:

- Title and one-paragraph north star.
- Scope, non-goals, assumptions, and authority boundaries.
- Sources reviewed with links or local paths.
- Current state or current gap.
- Target behavior or desired outcome.
- Recommended path and alternatives considered.
- Phases or workstreams, with sequential versus parallelizable work marked.
- Data/content model impact, when applicable.
- Environment/config/deployment impact, when applicable.
- QA/validation matrix.
- Acceptance criteria and definition of done.
- Risks and mitigations.
- Open questions and decisions needed.
- Implementation handoff summary.

## Type-Specific Additions

For frontend, design, or product plans, include:

- Figma/design references, node IDs, screenshots, or current/target comparisons when available.
- Embedded HTML mockups or prototypes by default for any plan with a meaningful frontend, dashboard, or product UI surface. Use low-fidelity wireframes when final visuals are unknown. Skip only when the user explicitly declines visuals or the plan is purely non-UI.
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

As you get corrected through the plan, ask if this skill document should get updated to prevent future corrections (if applicable and not too specific to the current plan).
