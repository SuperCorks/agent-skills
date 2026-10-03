# Templates

Copy a template from `assets/templates/`, replace every `<!-- guide: ... -->` comment with content (or delete the section), and keep the section ids so the TOC, anchors, `check`, and `outline` work. Sections marked optional can be deleted; required ids only produce a warning when missing, because small reports may merge sections.

## Choosing

| Template | Use for | Default audience |
| --- | --- | --- |
| `plan.html` | Implementation, QA, rollout, integration, architecture, and design plans; anything a future agent will execute. Used by the `html-plan` skill. | internal |
| `findings.html` | Investigations, bug diagnoses, data analyses, QA runs, audits, incident reports: anything that answers a question with evidence. | internal |
| `brief.html` | Stakeholder or client briefs, vision documents, executive summaries, proposals: a non-technical reader making decisions. | client |

## Section order and ids

**Plan**: `summary` (at a glance, optional) → `scope` → `questions` → `sources` → `current` → `target` → `architecture` (optional) → `phases` → `rollout` (optional) → `qa` → `acceptance` → `risks` → `handoff`.

**Findings**: `summary` (verdict and key numbers) → `scope` (question, scope, method) → `findings` → `impact` → `options` (optional) → `recommendation` → `decisions` (optional) → `next` → `limits` (limits, definitions, sources).

**Brief**: `summary` (the one-minute version) → `overview` (plain-English description) → `decisions` → `working` (optional) → `visuals` (optional) → `options` (optional) → `risks` (optional) → `phases` (phase 1, 2, 3) → `next`.

Add extra sections when the work needs them (for example `ux`, `data`, `mechanism`, `timeline`); give each an id and an `<h2>`. Place a plan's extra sections next to the closest related section. In a findings report, supporting evidence sections go after `next` and before `limits`, so the answer, decisions, and next steps stay near the top. Keep decisions where each template puts them: right after `scope` in a plan, after `recommendation` in a findings report, and after `overview` in a brief.

When the source has nothing for a required section, keep it short and say what is missing (for example, "No owner assigned yet; Red Krypton proposes ...") rather than inventing content.

## Variants

- Client-facing plan: start from `plan.html`, set `data-audience="client"`, add `data-numbered` if the reader will refer to sections by number, and drop engineering-only sections (`sources`, `handoff`) or move their content into an internal copy.
- Short report: delete optional sections and merge small ones; a findings report can be a hero, `summary`, `findings`, and `next`.
- Multi-document packages: build each report separately and add a small index report (`brief.html` stripped to a hero and a `.grid` of `.card` links).
