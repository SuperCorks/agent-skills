# Atlas verification

## Reusable renderer checks

When changing the bundled renderer or viewer, run from the skill directory:

```sh
python3 -B scripts/test_renderer.py
node tests/browser.cjs
```

The browser suite requires an installed `playwright` Node module and its Chromium runtime. If provided through a bundled dependency directory, set `NODE_PATH` to that `node_modules` directory. It launches isolated headless Chromium, generates synthetic test fixtures in a temporary directory, and reports screenshots there for visual inspection. These fixtures test presentation behavior; they are not product evidence. The atlas itself has no Node or Playwright runtime dependency.

These checks cover the shared renderer, not the factual accuracy or completeness of any generated product atlas.

## Product correctness and coverage

First verify each story: access prerequisites, entry trigger, exact controls, ordered results, business rules, branches, platform differences, and screenshots. Resolve contradictions using runtime and source evidence.

Then inspect for omissions independently of the existing story list. Compare scope against navigation, capabilities, roles, permissions, lifecycle transitions, and meaningful recovery paths. Passing tests or one screenshot per route do not prove journey completeness. Use a separate reviewer or bounded parallel groups when useful; observed outcomes outrank reviewer consensus.

Do not implement product changes during documentation unless separately requested. Keep UX opportunities attached to affected stories and distinct from existing behavior.

## Reader experience

- Lead with useful personas/features/stories, not project-status or audit dashboards.
- Each story makes sense without leaving it to find screenshots. Shared screens appear in every relevant sequence.
- Walkthroughs are visible; optional notes and export are secondary.
- Stories have working direct links; sources are at the end.
- Inspect desktop and narrow widths for legibility, sequence order, image proportions, keyboard focus, and horizontal overflow.

## Viewer regression scenarios

Use two multi-image stories that share an image asset, plus a single-image story. Sharing an image matters: navigation must follow the active story, not global image order or URLs.

| Action | Expected result |
| --- | --- |
| Open first image | Correct title/caption/position; complete-image fit; previous disabled |
| Click Next and press Right | Advance within the same story |
| Advance at last image | Stay there; Next disabled; no wrapping or adjacent story |
| Open shared image from another story | Use that story's caption/order/group |
| Open single-image story | Directional controls hidden; close/inspection remain |
| Enter fullscreen and use arrows | Same sequence and story boundaries |
| Fullscreen unavailable/rejected | Enlarged dialog remains usable with honest feedback |
| Zoom and restore Fit | Detail is accessible; entire image fits again |
| Escape / close | Leave viewer predictably and restore focus; native Escape may first exit fullscreen |
| Tab / Shift+Tab | Modal focus containment and accessible controls |
| Type and use arrows in notes | Normal text editing; no screenshot navigation |

Check missing-image feedback and console errors. Test actual fullscreen when supported; a mocked API or enlarged modal alone does not prove fullscreen behavior.

## Optional notes

Verify notes omitted and included. Enter distinct notes on two stories, reload, and check persistence. Export Markdown and inspect IDs/titles/text. On a catalog, include notes from other visited story pages in the export.

A separate atlas reusing a story ID must not inherit its notes. Refreshing content with unchanged atlas/story IDs must preserve them. When storage access fails, editing/export should still work with clear persistence feedback.

## Package and delivery

Check both single-document and catalog output: index, every story URL, anchors, images, CSS/JS, and sources. Open with the intended delivery method; a local HTTP server provides more consistent browser storage than `file:` URLs.

When publishing, inspect the remote entry point and dependencies, not only the upload command. Verify no runtime link points to local files or localhost. Keep unavailable/private evidence out of public links and describe limitations without exposing secrets.

Return the entry point, scope documented, checks actually performed, and important gaps. Keep test logs and capture inventories outside the reader-facing atlas.
