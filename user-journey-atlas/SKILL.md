---
name: user-journey-atlas
description: Create or refresh illustrated documentation of an existing product's personas, features, and user journeys using real application screenshots. Use for user stories documents, existing-flow documentation, feature walkthroughs, screenshot atlases, and UI/UX walkthrough reviews. Not for inventing future requirements or explaining code diffs.
---

# User Journey Atlas

Help a reader understand what people can do in the product today, screen by screen. The deliverable is an HTML atlas of actual journeys, with compact UX observations where useful. Honor an explicitly requested format or scope.

## Establish the task

- Identify the product, feature or catalog scope, target environment, personas, and supported platforms from the request and available project context. Ask only about consequential gaps that inspection cannot resolve.
- **Ask whether to include review notes for every new atlas generation**, unless the current request already answers this. Suggested wording: “Include browser-local per-story review notes and Markdown export?” Continue independent discovery while awaiting the answer; if unanswered, omit notes and proceed. This is a presentation preference, not an approval gate. A refresh of the same atlas preserves its selected mode unless the user changes it.
- Documentation does not authorize application fixes, a redesign, new product requirements, or public publication. Capture safe local/test states within the task's authorization; keep genuine limitations visible beside affected stories.

## Map and verify the existing journeys

1. Read the relevant product docs, existing atlas, implementation, and tests. Inspect the running application to reconcile documented intent with current behavior. Do not convert a route list or test names directly into claims of complete coverage.
2. Inventory personas and features, then identify the journeys each persona can actually perform. For each story, document purpose, prerequisites, entry trigger, ordered actions and exact control labels, results, business rules, final outcome, and relevant alternative/recovery paths.
3. Use [capture-and-refresh.md](references/capture-and-refresh.md) when gathering evidence or updating an atlas. Include the intermediate screens and dialogs that make the journey understandable, not just an initial and final screenshot.
4. Put the ordered screenshot sequence **inside each story**. Repeat a shared screen in every story that needs it; reuse the underlying image asset. A shared gallery or “see the screenshots above” cannot replace the story's sequence.
5. Cover supported platforms in scope and explain differences in terminology, steps, controls, permissions, and behavior. Native iOS/Android evidence must come from those surfaces, not responsive web pretending to be native.
6. Distinguish runtime-observed behavior, code-supported but unverified behavior, and unknown states. Label proposed UX improvements separately from current behavior. Capture specific friction encountered during the walkthrough without turning the document into an unsolicited comprehensive audit.

## Compose the atlas

Read [authoring.md](references/authoring.md) for the bundled renderer, content input, and reusable presentation assets.

- Default to a **single HTML document for a focused feature walkthrough**, or an **index plus individual story pages for a product-wide catalog**. Preserve an existing layout when refreshing unless restructuring is requested or necessary for usability.
- Lead with a short product introduction and useful persona/feature navigation, then the stories. Keep story content visible. Use stable identifiers, direct story links, concise prose, and captions describing what the reader should notice.
- Keep screenshots large enough to read and display complete images without cropping. Use separate image assets rather than enormous base64-embedded HTML.
- Put sources at the end. Keep capture inventories, test logs, and maintenance/reproduction details in supporting working material. Do not fill the atlas with scope/authority essays, open-decision gates, architecture/build plans, reconciliation history, audit counters, or change ledgers.
- Retain compact story-level warnings when evidence is missing or behavior differs from the reader's expected environment. A clean presentation must not conceal uncertainty.
- Link related vision or product documents when useful and already available; generating them is not required.

### Screenshot viewer contract

Reuse the bundled viewer, including when adapting the visual design:

- Click an image to open an enlarged viewer showing its story title, caption, and position.
- Previous/next buttons and Left/Right arrows stay **inside the active story's image sequence**, including in fullscreen. Group by story identity, not image URL, page-wide image order, or the currently filtered DOM list.
- Stop at endpoints, disable the unavailable direction, and hide navigation for a single-image story. Do not wrap or cross into another story.
- Fit the entire image initially and offer closer inspection. Provide fullscreen when supported and retain an enlarged dialog when it is unavailable.
- Support Escape, labeled controls, visible focus, modal keyboard behavior, and focus restoration to the originating image. Do not intercept arrows while the user types in note fields or outside the viewer.

### Optional review notes

When selected, place per-story notes **below the walkthrough**, with subdued controls and unobtrusive export. Stories and images remain the primary visual focus. Notes save in this browser for the atlas/story identities and export to Markdown with story identifiers. State the local-only storage boundary; do not imply collaboration, cloud sync, or sending. If browser storage is unavailable, keep editing/export usable and say that persistence is unavailable. Do not add a review dashboard or disposition workflow unless requested.

## Refresh, validate, and deliver

- A refresh reassesses the whole requested catalog, includes newly discovered journeys, and replaces screenshots affected by UI changes. Old screenshots plus new prose do not constitute a completed refresh. Preserve valid story identifiers, links, and the selected notes mode.
- Follow [verification.md](references/verification.md): verify each journey's correctness and separately check for missing journeys. Use independent or parallel review when it adds value; do not prescribe agent counts or particular models.
- Use applicable project verification guidance for application captures, `web-computer-use` for local browser coordination, and available native control tools for native platforms. These skills guide their respective operations; do not impose their unrelated deliverables on the atlas.
- Save to the project's established documentation location when a maintained atlas is requested; otherwise use the task's artifact/output directory. Return a clickable local entry point and meaningful limitations.
- When publication is requested, use `publish-artifacts` where available. Verify the remotely served index, story pages, images, and related links. Local filesystem links must not be left in the published package. Do not publish merely because the atlas supports linked images.
