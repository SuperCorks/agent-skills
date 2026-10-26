# Google Docs delivery

Some clients want a Google Doc they can edit and comment on instead of a Kernel report link. `scripts/gdoc.mjs` writes a built report into a new Google Doc once. **From then on the Doc is the source**: agents and the client both work in it, and the HTML file is only the first draft (`report.mjs check` warns if someone edits it after the handover). Comments stay in Google Docs; Kernel does not sync them.

Every Google call goes through the `gws` CLI (see the `google-workspace` skill). `--account <alias>` runs it as that Google account through `gswitch run <alias> -- gws …`, without changing the active profile. `create` remembers the account in the sidecar, so later commands on the report need no `--account`.

## Workflow

1. **Build and review the report as usual**, then ask the user for the Google account (a `gswitch` alias such as `sim` or `rk`), the Drive folder (a folder id, or none for My Drive), and the recipients. Never guess the account for a client.
2. **Create:** `node "$HRB/scripts/gdoc.mjs" create report.html --account rk --folder <folderId>`
   - Writes the Doc and `report.gdoc.json` beside the report (the Doc's id, URL, and account).
   - Decks are refused; share them as a Kernel link or PDF.
   - `--dry-run` converts and counts without calling Google; `--title` overrides the Doc's name; `--brand kit.json|none` overrides the inlined brand kit.
3. **Share:** `node "$HRB/scripts/gdoc.mjs" share report.html --to raine@client.com` adds each address as an editor (`--role commenter|reader` for less). No email is sent unless `--notify` (with an optional `--message`); Google's notification is a message to the client, so add it only when the user asks.
4. **Attach the Doc to the Kernel task** as a link attachment, under the `task_attachments` preset, so other agents find it.
5. **Each later round** (feedback, revisions, answers):
   1. `outline` to read the Doc as it is now.
   2. Fold the client's comments, suggestions, direct edits, and typed answers into edits.
   3. `edit` with an operations file (agent changes go in as **suggestions** by default).
   4. Draft replies to the comments in the user's voice (with the `my-voice` skill when available) with the Doc link, and send them only when they say so (`edit --outbound`).
6. **Snapshot** when Kernel or a client needs a fixed copy: `gdoc.mjs snapshot report.html --out report-v2.pdf` (also `.docx`, `.md`, `.txt`). Upload the PDF to the Kernel task as a new version if the task keeps one.

## How the Doc is laid out

- Every section, question card, finding, and figure is a named range `k_<id>`, and each question's answer cell is `k_<id>_answer`. Agents address content by these ids and by the handles `outline` prints, never by character positions.
- Labels the HTML draws with CSS are real text: "Q1.", "F1.", "Recommendation:", "Owner:", "Details:", "Answer", "Exit:", "Before"/"After", "Recommended", and the ✓ ◐ ✕ ○ status marks.
- Callouts, recommendations, and code are shaded paragraphs with a coloured left border. Tiles, cards, grids, lanes, options, compare, and terms are tables. Steps are one numbered list, with their bodies indented under them. Flows read as `A → B → C`.
- Charts (their print snapshots), Mermaid diagrams, device mockups, pins, shots, bars, and roadmaps are photographed at 2x in the print layout and inserted as images. Images reach Google through a Drive file shared "anyone with the link" for the seconds the insert takes, then deleted. This is the only route: Docs refuses data URIs and cannot read private files.
- A brand kit sets the named styles' fonts and colours and puts its light logo in the page header. Fonts must be Google Fonts names to render; others fall back.
- Client reports lose `.internal` blocks and evidence pills, as in a PDF.

## Reading: `outline`

`gdoc.mjs outline <doc>` (a Doc URL or id, or the report path) prints:
- the revision;
- the sections with their paragraph ranges;
- question answers;
- open comments (author, quoted text, replies, and the section they sit in);
- open suggestions (author and summary, such as `Replace: "24 hours" with "12 hours"`);
- every paragraph with its handle (`p12`), style, and text.

In that text, pending suggestions show as `[+inserted+]` and `[-deleted-]`, and tables (`t3`) list their cell paragraphs. Use `--section <id>` for one section in full, `--full` for long tables, and `--json` for the model. A `+` marks text outside every range, usually something the client added after a section.

Handles belong to one revision. `outline` caches what it read, and `edit` resolves handles against that cached read and sends the edit with that revision. Google then merges it with anything typed since. Revisions expire after 24 hours, so run `outline` again before each edit.

## Writing: `edit`

`gdoc.mjs edit <doc> --ops ops.json [--direct] [--outbound] [--dry-run] [--revision <id>]` takes a JSON array of operations. `--dry-run` prints the plan and the exact requests without sending them.

| Operation | Fields | Notes |
| --- | --- | --- |
| `replace-text` | `find`, `replace`, optional `in` (handle or section id), `all` | Keeps the replaced text's formatting. Refuses a missing match, or more than one unless `all`. |
| `set-paragraph` | `p`, `text` or `html` (inline tags), optional `style` (`NORMAL_TEXT`, `HEADING_1`…) | Keeps the paragraph's style and list. Refuses paragraphs that hold an image. |
| `insert` | `after` or `before` (handle, table, or section id), `html` | Any report components, built and drawn like a report. `after: "<section>"` appends inside that section; a fragment that is itself a `<section id>` becomes a sibling with its own range. Not directly before a table, not inside cells. |
| `delete` | `from` (+ `to`), or `section` | Paragraphs, tables, or a whole section. |
| `replace-section` | `section`, `html` | New content for the section; keep its id on a wrapping `<section>`. |
| `set-answer` | `q`, `text` | Writes into the question's answer cell. |
| `replace-image` | `image` (`i3`), `png` (file path) | Replaces in place, cropped to the old size. |
| `accept`, `reject` | `suggestion` (`g2`) | The client's or your own pending suggestions. |
| `comment` | `on` (handle or section) or `find` (+ `in`), `text` | Anchored to that text. **Outbound.** |
| `reply` | `comment` (`c1`), `text`, `resolve` or `reopen` | **Outbound** when it has text; resolving alone is not. |

```json
[
  { "op": "replace-text", "in": "q1", "find": "24 hours", "replace": "12 hours", "all": true },
  { "op": "insert", "after": "risks", "html": "<div class=\"callout warn\"><p><b>New:</b> the vendor moved the date.</p></div>" },
  { "op": "set-answer", "q": "q2", "text": "Agreed on the call of 10/24." },
  { "op": "accept", "suggestion": "g1" }
]
```

- **Suggestions by default.** Content changes go in as tracked suggestions the client can accept or reject; a comment stays anchored while a suggestion rewrites its text, whereas a direct rewrite detaches it. Use `--direct` for mechanical fixes, or when the user asks for direct edits.
- **What the client did.** A client's suggestion is folded in with `accept` (or by editing and then `reject`). Their direct edits are already in the Doc, so read them in `outline` and build on them.
- **Order.** Operations in one file are applied from the end of the Doc backwards; operations that touch the same text are refused, so split them into separate edits.
- **Outbound.** `comment` and `reply` with text reach the client, and Google emails them. The command refuses them without `--outbound`. Pass `--outbound` only after the user approved the exact wording in this conversation.

## Limits

- One tab: content goes to the Doc's first tab.
- Fragments with charts or diagrams need the same browser and cached Plotly or Mermaid as `report.mjs build`.
- Table cells cannot hold tables; nested content is flattened into paragraphs.
- Merged cells (`colspan`) become empty neighbouring cells.
- If a run is killed while inserting images, search Drive for `gdoc-temporary-image-` and delete what is left: those files are shared with anyone who has the link.
- A client who deletes a whole section also deletes its range; `outline` then lists that content under the section before it, marked `+`.
