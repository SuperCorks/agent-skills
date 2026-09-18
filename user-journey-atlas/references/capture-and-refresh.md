# Capture and refresh

## Establish what exists

Inspect relevant product docs, routes, menus, roles, permissions, feature flags, tests, and business rules to form a candidate inventory. Then walk the real interface. Feature/route existence alone does not establish a usable end-to-end journey.

Treat older documents and screenshots as leads. Establish whether material behavior was observed in the current runtime, supported only by inspected code/docs, or remains unknown. Keep proposed improvements separate from the description of existing behavior. Include compact, clearly labeled UX opportunities beside affected stories; create a broader redesign or requirements proposal only when requested.

Record enough to reconstruct each journey:

- Who acts, what they want, and prerequisite account/data/permission state.
- Entry point and exact labels of the controls they use.
- Ordered actions, visible results, relevant automatic triggers, and final outcome.
- Business rules affecting the user's choices and results.
- Alternative, validation, recovery, empty, loading, and error states that actually apply.
- Platform differences and concrete UI friction encountered.

Do not manufacture a state checklist for every story. A loading state matters when it communicates meaningful progress; an unavailable error screen should be marked unverified rather than fabricated.

## Obtain actual visual evidence

Prefer the requested local/test environment and realistic fixture data. Use existing launch and verification instructions. Preparing reversible local fixtures is appropriate when it enables the requested captures; documentation alone does not authorize external purchases, messages, or production mutations.

Use applicable browser-control or native-app guidance. Confirm the active role and environment. Exercise controls to reach each state instead of drawing a mockup that resembles it. Do not alter screenshots with generative tools to make unimplemented UI appear real.

Capture the user's sequence, including meaningful intermediate forms, dialogs, confirmations, validation messages, and recovery states. Capture settled content except when loading is the documented state. Avoid accidental overlays or stale data obscuring the evidence.

Record platform, viewport/device, relevant fixture state, capture date, and available build/revision information in working notes. Expose short platform labels and material limitations in the atlas rather than a capture-methodology section.

Give screenshots accurate captions and useful alt text. Explain the visible state or next action. Keep complete screens uncropped and ensure details can be inspected at full resolution. Supplementary close-ups must not replace context necessary to understand the flow.

Capture each actual platform in scope. A shared design does not prove identical implementation. When access is unavailable, identify the specific missing surface/state; continue with truthful available evidence rather than silently substituting another platform.

## Reuse without losing context

Reuse a current image only when screen, data state, role, platform, and visible controls match the step. Repeat its placement wherever a story needs it. The viewer group belongs to the story, not to the image file. Keep separate image assets portable inside the artifact package.

## Refresh an atlas

1. Read the existing inventory, identifiers, layout, and review-note choice.
2. Compare every in-scope story with current code and runtime behavior, not only recent features.
3. Update affected steps, control names, rules, platform differences, and outcomes; add new journeys.
4. Replace affected screenshots, including stale images reused by other stories. Check for missing intermediate screens.
5. Preserve IDs for the same journeys. Never reuse an old ID for a different journey. If one is removed or replaced, preserve a useful link or migration note where readers would otherwise reach a dead end.
6. Keep notes associated with the same atlas/story identity; do not silently clear them during refresh.
7. Check individual story accuracy and catalog completeness. Keep significant unresolved gaps beside affected stories and in the handoff.

“Updated” means prose and visual evidence agree with the inspected version. If capture is blocked, identify which images remain historical; do not present the refresh as fully current.
