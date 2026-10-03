---
name: html-report-builder
description: Build, validate, and publish self-contained HTML reports from a shared component library and templates (plan, findings report, stakeholder brief). Use for investigation, analysis, QA, audit, and incident reports, stakeholder or client briefs, and as the rendering layer for html-plan; use html-plan itself for planning requests.
---

# HTML Report Builder

Write reports as plain semantic HTML using a fixed component vocabulary, then let the builder inline the shared CSS and JavaScript runtime. Agents never write stylesheets, so reports cost far fewer output tokens and every report has the same familiar structure.

In the commands below, `$HRB` is this skill's folder (for example `~/.agents/skills/html-report-builder` or `~/.claude/skills/html-report-builder`).

## Workflow

1. **Pick a template** from `assets/templates/` using `references/templates.md`:
   - `plan.html`: implementation, QA, rollout, architecture, or design plans (the `html-plan` skill decides the content).
   - `findings.html`: investigations, diagnoses, analyses, QA runs, audits, incidents.
   - `brief.html`: stakeholder or client briefs, vision documents, executive summaries.
2. **Read** the template, `references/components.md`, and `references/writing.md`. Read nothing else from this skill unless needed.
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
6. **Hand off** with the file path, a one-paragraph summary, and the open questions.

## Revising a report

- Run `node "$HRB/scripts/report.mjs" outline <file>` first. It lists each section's line range and size, every question with its answer, and every finding, so you can read and edit only the sections that change.
- Lines containing `data-hr-runtime` or `data-hr-generated` are generated; never edit them, and skip them when reading. Inlined images also make some `<img>` lines very long, so read line ranges with truncated lines, for example `sed -n '120,180p' report.html | cut -c1-400`.
- Keep question ids stable so answers stay attached, then rebuild.
- Answers the reader typed into `.answer` slots appear in `outline`; fold them into the decisions.

## Publishing

Local reports are single files with images inlined. Published reports use image references instead:

```bash
node "$HRB/scripts/report.mjs" export path/to/report.html --out /tmp/<slug>-publish
```

This writes `<slug>.html` plus `<slug>.assets/` and checks the copy. Upload the whole folder with `publish-artifacts` (as a directory) or to Kernel (the HTML as the file, each asset as a supporting file at its relative path).

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
| `report.mjs outline <file> [--json]` | Section map, questions with answers, findings |
| `report.mjs export <file> --out <dir>` | Publish copy with images as files |

Maintainers: run `node --test tests/*.test.mjs` and `NODE_PATH=<dir containing playwright> node tests/browser.cjs` from this folder after changing the runtime; `node tests/gallery.mjs <dir>` writes a component gallery for visual review. Classes in `assets/report.css` are append-only.
