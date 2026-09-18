# Authoring and rendering an atlas

Read this reference when turning a verified story inventory and captures into HTML, or refreshing an existing atlas. The renderer makes a dependency-free static document. It does not inspect the product, take screenshots, infer stories, or verify that supplied statements are true.

## Build commands

Keep the authored JSON and original captures outside the generated directory. Python 3.9 or later is sufficient; no package installation is needed. Run the following commands from this skill's directory, passing the location of your authored JSON and desired output.

```bash
python3 scripts/build_atlas.py /path/to/atlas.json \
  --output ./atlas-output --layout single --review-notes no
```

- Use `single` for a focused feature walkthrough. It produces `index.html` with stable `#story-id` links.
- Use `catalog` for a product-wide collection. It produces an index plus `stories/story-id.html` pages with their own screenshots, notes, sources, and navigation.
- Set `--review-notes yes` only after the current request or the user's answer selects notes. The CLI defaults to `no`; it does not ask on the agent's behalf.
- `--replace` refreshes an output previously generated for the same atlas ID. Without this flag, a nonempty output is refused. With it, only files listed in the atlas manifest may be overwritten or removed; unrelated files are retained and conflicting unmanaged paths are refused. Do not hand-edit the generated files and then expect a rebuild to preserve those edits.

Open the generated `index.html` to read it. For catalog review notes, serve the directory at a stable local origin so every story page uses the same browser storage:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory ./atlas-output
```

Visit `http://127.0.0.1:8765/`. Storage behavior for `file:` URLs varies by browser; do not promise cross-page notes when opening a catalog directly from disk. Keep the origin, atlas ID, and story IDs stable to retain notes across a refresh.

## Content model

All authored text is plain text, escaped by the renderer. Use complete, readable sentences and exact visible control labels. HTML and Markdown are not interpreted. Array order is reading order. Optional sections are omitted when empty.

Required root fields:

| Field | Shape and purpose |
| --- | --- |
| `id` | Stable lowercase hyphenated atlas identifier, such as `example-product-account`. Include the product/feature identity so unrelated atlases served at the same origin do not share notes. |
| `title` | Reader-facing product or feature title. |
| `personas` | Objects with `id`, `name`, and `description`; stories reference persona IDs. |
| `stories` | One or more story objects, ordered for readers. |

Optional root fields are `summary` (a short product/feature introduction) and `sources` (the source format below).

Required story fields:

| Field | Shape and purpose |
| --- | --- |
| `id` | Stable lowercase hyphenated identifier, such as `change-display-name`; unique in the atlas and used in its links. |
| `title` | A concrete goal or outcome. |
| `persona` | One of the root persona IDs. |
| `purpose` | What this person wants to achieve and why. |
| `preconditions` | Array of prerequisite strings. An empty array means there are no additional prerequisites. |
| `trigger` | What starts this journey. |
| `steps` | Nonempty ordered array of step objects. |
| `outcome` | What is true when the journey finishes. |

Optional story fields:

| Field | Shape and purpose |
| --- | --- |
| `feature` | A reader-facing feature label; the index groups stories by this label. |
| `rules` | Array of business-rule strings. |
| `alternatives` | Objects with `title`, `detail` (condition and short explanation), and optional `steps` using the same ordered step format. Include steps and captures for meaningful recovery/alternative journeys. |
| `platforms` | Objects with `name` and `detail` describing verified platform differences or an explicit verification gap. |
| `evidence` | Objects with `status` (`observed` or `unverified`) and `detail`. State precisely which behavior was exercised, which rule is implementation-backed, or what could not be verified. |
| `opportunities` | Array of concrete UX observations or ideas. These appear under “UX opportunities · proposed” and are never presented as existing behavior. |
| `sources` | Evidence references for this story, shown in the footer. |

Each step has:

- `action`: the actual user action, naming the exact control.
- `result`: the screen, state, feedback, or effect that follows. Explicitly label a result that has not been exercised.
- `images`: optional ordered array of `{ "src": "captures/screen.png", "caption": "…", "alt": "…" }`. A meaningful image needs both a readable caption and useful alternative text. The image sequence appears within this step and story. Multiple images are allowed for a transition or intermediate dialog. Story viewer order follows the displayed main steps and then alternative steps.

Use image assets from actual application captures. Do not replace a missing observation with a drawn, generated, or unrelated example screen. If a state cannot be captured, document the limitation in the relevant step and evidence note; an image-free step is allowed so the renderer does not encourage fabricated evidence.

`src` accepts a local PNG, JPEG, WebP, GIF, or AVIF path, resolved relative to the input JSON, or an explicit HTTP(S) URL. Local paths can be absolute, but relative capture paths make the input portable. Local images are copied into `images/` under a content hash; identical bytes are copied once even when several stories or source paths reuse them. Every story still renders its own image occurrence and caption. Remote images are referenced as given, never downloaded. Prefer local captures for a deliverable that remains usable offline; verify any intentional external dependency before sharing. Inline data URLs, SVG files, credential-bearing URLs, script URLs, and `file:` URLs are rejected.

A source is `{ "label": "Readable reference", "url": "https://…", "note": "Optional context" }`. `url` and `note` are optional. Only HTTP(S) URLs become links. Represent a repository file and line or another non-web reference as label/note text; do not put local machine paths into public navigation. Sources appear at the end of each applicable page.

This minimal schema example illustrates shape, not verified product behavior:

```json
{
  "id": "example-product",
  "title": "Example product journeys",
  "summary": "How members manage their profile.",
  "personas": [
    { "id": "member", "name": "Member", "description": "A signed-in account holder." }
  ],
  "stories": [
    {
      "id": "change-display-name",
      "title": "Change a display name",
      "feature": "Profile",
      "persona": "member",
      "purpose": "Choose the name shown to other members.",
      "preconditions": ["The member is signed in."],
      "trigger": "Open Profile from the account menu.",
      "steps": [
        {
          "action": "Select Edit name.",
          "result": "The name editor opens; replace this example with the observed state.",
          "images": []
        }
      ],
      "outcome": "Replace this example with the verified end state.",
      "evidence": [
        { "status": "unverified", "detail": "Schema illustration; no application was inspected." }
      ]
    }
  ]
}
```

For a real story, add images to the relevant steps, for example:

```json
{
  "src": "captures/profile-editor.png",
  "caption": "The name editor after selecting Edit name.",
  "alt": "Name editor with a display-name field and Save and Cancel buttons."
}
```

## Refresh and portability

Reinspect affected behavior and compare the inventory before editing the source JSON. Retain atlas/story IDs when the user goal persists; add newly discovered journeys and replace affected captures. Reusing IDs based only on their sequence number after reordering stories can attach notes to the wrong story. Preserve existing direct links when adapting an older artifact; if its identifier format differs from the renderer's format, adapt the renderer or retain compatible pages/anchors rather than silently renaming stories.

Rebuild using the original layout and explicit review choice. Keep a layout stable when previously shared links must keep working: switching from a single file to a catalog changes URL shape and is a deliberate migration. `--replace` removes obsolete generated story pages and image files recorded in the manifest. Preserve a prior version outside the output if its screenshots or URLs must remain available. Refresh does not delete browser notes, but export current notes before retiring a story because the atlas export includes only stories in the current inventory.

Publish the complete generated directory when requested, using `publish-artifacts`; HTML alone omits its CSS, JavaScript, story pages, and captures. After publication, follow index and direct story links, load images, and exercise the viewer at the public URL. Do not claim an unrequested upload, a published URL, or shared notes.

## Template contracts

`assets/page.html`, `assets/atlas.css`, and `assets/atlas.js` are the reusable starter. Prefer changing authored content through JSON. If adapting presentation, keep these interaction contracts:

- Each story owns a `[data-story-id]` article with `data-story-title`. Each image button has `[data-view-image]`, `data-full-src`, `data-caption`, and an inner image with useful `alt`. The viewer discovers images inside the clicked story element; grouping by image URL or a document-wide image list breaks shared-image stories.
- Keep the native `.viewer` dialog and inner `.viewer-panel`. Actual fullscreen targets the panel because browsers reject fullscreen requests on a dialog. The title, caption, and position remain visible. The panel retains all controls in fullscreen.
- Previous/next actions stop at story endpoints. The navigation is hidden for one image. Initial fit uses the complete image; zoom enables scrolling through a larger image. Keyboard arrows operate within the open dialog and ignore editable controls. Tab/Shift+Tab stay within visible enabled viewer controls. Escape exits fullscreen first, then closes the enlarged viewer; closing restores focus to the clicked image.
- Keep the review choice in `data-review-notes`. Notes belong beneath their story; the footer offers an atlas export that includes notes from other story pages at the same browser origin. Storage uses `user-journey-atlas:v1:<atlas-id>:<story-id>`. A storage failure must leave typed text usable and exportable, and show an honest warning. `data-story-catalog` is inert JSON containing the current atlas's IDs/titles for cross-page export; retain the renderer's escaping.
- Keep semantic headings, visible content, complete-image screenshots, a narrow prose measure, and a broad image column. Do not turn the atlas into a dashboard, collapsed outline, implementation plan, or maintenance report.

Run the renderer tests after changing generation, escaping, dependencies, or replacement behavior:

```bash
python3 -B scripts/test_renderer.py
```

Browser verification is separate: follow [verification.md](verification.md) for real viewer, fullscreen, keyboard, notes, export, and visual checks. A successful build does not verify these interactions or the documented application's behavior.
