---
name: html-report-builder
description: Build, validate, publish, and locally edit self-contained HTML reports and slide decks from a shared component library and templates (plan, findings report, stakeholder brief, slides), including a point-and-click editor with AI rewrites. Use for investigation, analysis, QA, audit, and incident reports, stakeholder or client briefs, presentation decks, editing an existing HTML report, and as the rendering layer for html-plan; use html-plan itself for planning requests.
---

# HTML Report Builder

Write reports as plain semantic HTML using a fixed component vocabulary, then let the builder inline the shared CSS and JavaScript runtime. Agents never write stylesheets, so reports cost far fewer output tokens and every report has the same familiar structure.

In the commands below, `$HRB` is this skill's folder (for example `~/.agents/skills/html-report-builder` or `~/.claude/skills/html-report-builder`).

## Workflow

1. **Pick a template** from `assets/templates/` using `references/templates.md`:
   - `plan.html`: implementation, QA, rollout, architecture, or design plans (the `html-plan` skill decides the content).
   - `findings.html`: investigations, diagnoses, analyses, QA runs, audits, incidents.
   - `brief.html`: stakeholder or client briefs, vision documents, executive summaries.
   - `slides.html`: presentation decks (executive briefings, client pitches, CEO or CTO decks). Also read `references/slides.md`.
2. **Read** the template, `references/components.md`, and `references/writing.md` (plus `references/slides.md` for a deck). Read nothing else from this skill unless needed.
3. **Write the report** as one `.html` file:
   - Inside a repository, prefer `docs/plans/YYYY-MM-DD-<slug>.html` for plans and `docs/reports/YYYY-MM-DD-<slug>.html` for other reports; otherwise use the workspace's `outputs/` folder.
   - Keep the template's `<head>`, `<html>` attributes, and section ids. Replace every `<!-- guide: -->` comment with content or delete the section.
   - Use only the documented classes. Write no CSS or JavaScript, except mockup styles in one `<style>` whose selectors all use `.mock-*` classes.
   - Put images in a sibling `<slug>.assets/` folder and reference them with relative paths.
4. **Build** in place (refreshes the runtime and table of contents, inlines local images, then validates):

   ```bash
   node "$HRB/scripts/report.mjs" build path/to/report.html
   ```

   Fix every `ERROR`. Treat each `WARNING` as a prompt to fix or consciously accept. Building twice changes nothing, and building an older report upgrades its runtime.
5. **Look at it** when a browser tool is available: check desktop (about 1280 px) and mobile (390 px) widths, both color schemes if the report has mockups, and the console.
6. **Hand off** with the file path, a one-paragraph summary, and the open questions. When the user will review the report, offer the local editor (below) so they can fix wording, answer question cards, and rewrite sections in place.

## Revising a report

- Run `node "$HRB/scripts/report.mjs" outline <file>` first. It lists each section's line range and size, every question with its answer, every finding, and every open review comment with the section and line it is pinned to, so you can read and edit only the sections that change.
- Lines containing `data-hr-runtime` or `data-hr-generated` are generated; never edit them, and skip them when reading. Inlined images also make some `<img>` lines very long, so read line ranges with truncated lines, for example `sed -n '120,180p' report.html | cut -c1-400`.
- Keep question ids stable so answers stay attached, then rebuild.
- Answers the reader typed into `.answer` slots appear in `outline`; fold them into the decisions.
- Review comments are requests from the reader: make the change, then answer each one in the comment store after `</main>` by adding `<p data-by="Codex" data-at="2026-10-09T16:00Z">What changed.</p>` to its `<article data-hr-thread>` (use your own agent name and the current UTC time), and add `data-status="resolved"` when it is done. Never edit or remove the reader's own entries, and keep each pinned element's `data-hr-comment` attribute.

## Local editor

The editor opens a report in the browser with point-and-click editing, deletion, and an AI rewrite button. It works on any HTML report, not only builder reports, and saves straight into the file.

```bash
node "$HRB/editor/report-editor.mjs" path/to/report.html [--provider codex|openrouter] [--model gpt-6-luna] [--effort low] [--author "Name"] [--port 0] [--no-open]
```

- Start it as a background process; it prints a tokenized `http://127.0.0.1:<port>/?t=...` link and opens the browser. It serves only that one report (and files beside it) on 127.0.0.1. Stop it with Ctrl+C or by ending the process.
- Click any paragraph, list item, heading, table cell, tile, or `.answer` slot to edit its text; Enter saves, Shift+Enter adds a line break, Esc cancels. Only that element's bytes change.
- Click beside the text (a card's padding, the gap between paragraphs) to select the card, list, or section around it. **Delete** (or the Delete key) removes the highlighted section, card, table row, list, tile, figure, or paragraph; hovering the button outlines exactly what will go. Wrappers left empty go with it, a slide takes its speaker notes, and links elsewhere that pointed into it become plain text. The page title, section headings, table cells, and `.answer` slots cannot be deleted on their own.
- Select a block, widen the scope with the labels in the toolbar (for example to the whole card or section), and press **Rewrite with AI** (Cmd+K). The proposal is validated (same element and ids, no scripts or unknown markup; images, code, and mockups are protected), previewed in place with a word diff, and written only on **Accept**. Undo and Redo cover every save.
- **Comment** (or C), then click anywhere on the report, including a spot on a screenshot or chart, to pin a review comment there. Pins open threads to reply, resolve, reopen, or delete; **Comments** lists them all, with resolved ones behind "Show resolved". Comments save into the report file (a hidden store after `</main>`, with the pinned element marked by `data-hr-comment`), stay hidden when reading, printing, or presenting, follow their element through text edits and AI rewrites, and stay listed as detached when their part is deleted. The author is `--author`, else git's `user.name`.
- AI defaults to the Codex CLI on the user's ChatGPT login with `gpt-6-luna` at `low` effort (about 5 to 10 seconds per rewrite, no API cost). If `codex` is missing or logged out, it falls back to OpenRouter (`openai/gpt-6-luna`) when `OPENROUTER_API_KEY` is set. Change provider, model, and effort from the toolbar; they persist in `~/.config/html-report-editor/config.json`.
- The first save backs up the original to `~/.cache/html-report-editor/`. If an agent changes the file while it is open, the page reloads; edits based on an old version are refused instead of overwriting.

After the user has worked in the editor, run `outline` before revising: it shows their answers and open comments, and every edit is already in the file.

## Publishing

Local reports are single files with images inlined. Published reports use image references instead:

```bash
node "$HRB/scripts/report.mjs" export path/to/report.html --out /tmp/<slug>-publish
```

This writes `<slug>.html` plus `<slug>.assets/` without any review comments, and checks the copy. `check` warns when a client report still stores comments, since sharing the file itself would share them. Upload the whole folder with `publish-artifacts` (as a directory) or to Kernel (the HTML as the file, each asset as a supporting file at its relative path).

## Presenting decks

A `slides` report opens as stacked 16:9 slides with speaker notes under each one. Press P (or click Present) to present: arrows move, N shows notes, F toggles fullscreen, Esc exits. On phones and tablets, swipe or tap to move and use Back to exit. Printing gives one slide per page. Details are in `references/slides.md`.

## Keeping the templates current

The templates and references encode corrections reviewers have made before. When the user corrects a report or deck in a way that would apply to future ones (structure, voice, a missing component, a recurring layout fix), ask whether to fold it into `references/writing.md`, `references/slides.md`, `references/components.md`, or a template, and make the change in the skills repository rather than in an installed copy. Keep report-specific feedback out of the skill.

## Rules

- Self-contained: no CDN scripts, web fonts, remote images, iframes, or network calls. External hyperlinks are fine.
- Every `<main>` section has an `id` and an `<h2>`; the TOC is generated from them.
- Question cards: ids `q1`, `q2`, ... in order, full-sentence titles ending in `?`, a `.rec` when there is a recommended answer, and an empty `.answer` slot.
- Client reports (`data-audience="client"`) contain no `.internal` blocks, evidence pills, task IDs, tool names, or provenance notes; `check` enforces the first two.
- Do not copy component CSS into a report or invent classes. If a needed component is missing, use the closest existing one and mention the gap in the handoff.

## Commands

| Command | Purpose |
| --- | --- |
| `report.mjs build <file>` | Refresh runtime CSS/JS and TOC, inline local images, validate |
| `report.mjs check <file> [--json]` | Validate only |
| `report.mjs outline <file> [--json]` | Section map, questions with answers, findings, review comments |
| `report.mjs export <file> --out <dir>` | Publish copy with images as files |

Maintainers: run `node --test tests/*.test.mjs` and `NODE_PATH=<dir containing playwright> node tests/browser.cjs` from this folder after changing the runtime or editor; set `HR_CORPUS_LIST` (a file of report paths) to add the real-report corpus checks. `node tests/gallery.mjs` writes a component gallery for visual review. Classes in `assets/report.css` are append-only.
