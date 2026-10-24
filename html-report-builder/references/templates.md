# Templates

Start with the appropriate shell in `assets/templates/`, then select content for the reader's purpose. Every starter section is optional: add, reorder, merge, or delete sections, and replace every `<!-- guide: ... -->` comment. The TOC and `outline` follow the authored headings and ids, not a prescribed outline. Preserve ids when revising an existing report so links and feedback stay attached.

## Choosing

| Template | Use for | Default audience |
| --- | --- | --- |
| `plan.html` | Implementation, QA, rollout, integration, architecture, and design plans; anything a future agent will execute. Used by the `html-plan` skill. | internal |
| `findings.html` | Investigations, bug diagnoses, data analyses, QA runs, audits, incident reports: anything that answers a question with evidence. | internal |
| `brief.html` | Stakeholder or client briefs, vision documents, executive summaries, proposals: a non-technical reader making decisions. | client |
| `slides.html` | Presentation decks: executive briefings, client pitches, CEO or CTO decks, anything presented in a meeting. Rules and layouts in `slides.md`. | client |

## Choose the reading order

Begin with the answer or the purpose, then follow the reader's next necessary question. These are examples of different useful shapes, not alternative mandatory outlines:

- A resolved incident may need only the result, cause and impact, and recovery evidence. Add follow-up work only if any remains.
- A proposal may explain the concrete change, compare the meaningful alternatives, then request a decision. Put a self-contained blocking choice earlier when that helps.
- An analytical report may follow the metric, funnel, or business question, with definitions and caveats beside the evidence. It need not recommend a change.
- A review update may lead with the current outcome and remaining actions. Fold corrections into the relevant passages rather than carrying the whole revision history at the top.
- An executable plan needs enough scope, intended behavior, sequencing, and verification for its implementer. The `html-plan` skill owns that content; several concerns can share a section.

Give each section a meaningful id and an `<h2>`; topic-specific ids such as `email`, `checkout`, or `recovery` work as well as `findings`. No template-specific section ids or section order are required by `check`. Keep material limitations near the claims they qualify, and optional supporting detail where it is easiest to consult. Use the slide guidance for decks.

## Section templates

`section-templates.md` has copyable markup for common sections; read only the ones you use. Adapt sample headings, ids, component counts, and order to the report. Preserve existing ids on revisions.

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
- Short report: a hero and one substantive section may be enough; add more only when the reader needs them.
- Multi-document packages: build each report separately and add a small index report (`brief.html` stripped to a hero and a `.grid` of `.card` links).
