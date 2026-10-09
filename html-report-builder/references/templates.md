# Templates

Copy a template from `assets/templates/`, replace every `<!-- guide: ... -->` comment with content (or delete the section), and keep the section ids so the TOC, anchors, `check`, and `outline` work. Sections marked optional can be deleted; required ids only produce a warning when missing, because small reports may merge sections.

## Choosing

| Template | Use for | Default audience |
| --- | --- | --- |
| `plan.html` | Implementation, QA, rollout, integration, architecture, and design plans; anything a future agent will execute. Used by the `html-plan` skill. | internal |
| `findings.html` | Investigations, bug diagnoses, data analyses, QA runs, audits, incident reports: anything that answers a question with evidence. | internal |
| `brief.html` | Stakeholder or client briefs, vision documents, executive summaries, proposals: a non-technical reader making decisions. | client |
| `slides.html` | Presentation decks: executive briefings, client pitches, CEO or CTO decks, anything presented in a meeting. Rules and layouts in `slides.md`. | client |

## Section order and ids

**Plan**: `summary` (at a glance, optional) → `scope` → `questions` → `sources` → `current` → `target` → `architecture` (optional) → `phases` → `rollout` (optional) → `qa` → `acceptance` → `risks` → `handoff`.

**Findings**: `summary` (verdict and key numbers) → `scope` (question, scope, method) → `findings` → `impact` → `options` (optional) → `recommendation` → `decisions` (optional) → `next` → `limits` (limits, definitions, sources).

**Slides**: `s1` cover → `s2` the answer (statement) → context → options → the path (phases) → risks → the ask (divider). Slide ids run `s1`, `s2`, ...; each slide is followed by its `aside.notes`. See `slides.md`.

**Brief**: `summary` (the one-minute version) → `overview` (plain-English description) → `decisions` → `working` (optional) → `visuals` (optional) → `options` (optional) → `risks` (optional) → `phases` (phase 1, 2, 3) → `next`.

Add extra sections when the work needs them (for example `ux`, `data`, `mechanism`, `timeline`); give each an id and an `<h2>`. Place a plan's extra sections next to the closest related section. In a findings report, supporting evidence sections go after `next` and before `limits`, so the answer, decisions, and next steps stay near the top. Keep decisions where each template puts them: right after `scope` in a plan, after `recommendation` in a findings report, and after `overview` in a brief.

When the source has nothing for a required section, keep it short and say what is missing (for example, "No owner assigned yet; Red Krypton proposes ...") rather than inventing content.

## Section templates

`section-templates.md` has copyable markup for common sections; read only the ones you use, and keep the ids of the report template you started from.

| # | Section | Use for | Built from |
| --- | --- | --- | --- |
| 1 | Key findings | The verdict, key numbers, and numbered key points at the top | `.callout`, `.tiles`, `.keypoints` |
| 2 | Decisions needed | Questions with a recommended default; answered cards turn green | `.question` |
| 3 | Scope | In and out side by side, assumptions across the row | `.grid`, `.card.wide`, `.pros`, `.cons` |
| 4 | Findings | Findings by severity with what each affects | `.finding`, `.chips` |
| 5 | Source-of-truth matrix | Each metric against each system | table, cell tones |
| 6 | Trend | A measure over time with a threshold and an event | Plotly line |
| 7 | Funnel | Counts that narrow step by step | Plotly centred bars |
| 8 | Mix by group | How each group splits into parts | Plotly stacked bars, `details` table |
| 9 | Against targets | Measures against a target, misses marked | Plotly bars, target line |
| 10 | Timeline | An investigation or incident in order | `.steps.timeline` |
| 11 | Current versus target | Two step-by-step paths | `.compare` with `.flow` |
| 12 | Options compared | Options against criteria, recommendation underneath | table, `col.recommended`, `.rec` |
| 13 | Phases | Phases with owners, parallel work, and exit criteria | `.steps`, `.lanes`, `.gate` |
| 14 | Architecture | Layers, what is new and what is retired, and the systems | Mermaid, table |
| 15 | QA and acceptance | The QA matrix and the acceptance checklist | table, cell tones, `.checklist` |
| 16 | Risks | Likelihood, impact, mitigation, and owner | table, `.pill` |
| 17 | Screenshot review | Before and after screens with numbered pins | `.compare`, `.pins` |
| 18 | User story | A story's trigger, screens, and checks | `.card`, `.shots`, `.checklist` |
| 19 | Next steps | Who does what next, numbered | `ol.checklist` |
| 20 | Limits and sources | What the evidence cannot show, definitions, sources | `.callout`, `.terms`, `.sources` |

## Variants

- Client-facing plan: start from `plan.html`, set `data-audience="client"`, add `data-numbered` if the reader will refer to sections by number, and drop engineering-only sections (`sources`, `handoff`) or move their content into an internal copy.
- Short report: delete optional sections and merge small ones; a findings report can be a hero, `summary`, `findings`, and `next`.
- Multi-document packages: build each report separately and add a small index report (`brief.html` stripped to a hero and a `.grid` of `.card` links).
