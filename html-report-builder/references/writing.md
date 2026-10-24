# Writing rules

Use these editorial principles with any template. The reader's purpose determines the structure and depth.

## Lead with what the reader must know or decide

- Put the answer, verdict, or recommendation first. Method and background come after.
- Give the opening one clear job: convey the result, explain the proposal, or orient the reader to a choice. A short lede can do this without a second summary section.
- Choose sections and their order from the reader's needs. Put evidence beside the claim it supports and context before a choice only when it is needed to understand that choice. There is no universal questions-first sequence.
- Use question cards only for unresolved choices the reader must make. Put a blocking decision early when it is understandable on its own; put a choice after the comparison when that comparison is needed. Omit decisions, options, risks, phases, or next steps when they add nothing to this document.
- Write each decision question as a complete sentence ending in a question mark. Give only the context needed to answer, a recommended default when supported, and links to detail. Split choices that could receive different answers. Number new cards `q1`, `q2`, ... for batch replies; keep existing ids on revisions.

## Anticipate questions without adding bulk

- When relevant earlier documents are available, compare a small set of closely related revisions with their comments, answers, or review notes before drafting. Use the same client's examples for client-specific context. Distinguish an explicit correction or approval from new evidence and from your inference; a later version is not automatically a reviewed example.
- Ask what the reader is likely to misunderstand or need to act. Common gaps include: what changes in practice, what is already happening, why an option is better, how a number was counted, and what must happen before the proposed action. Select the questions that matter here; this is not a required FAQ.
- Answer factual questions in the passage, table, or diagram where they arise. Reserve question cards for choices; do not ask the reader to supply facts that can be checked.
- Make benefits concrete with a brief before/after example when it explains the difference. Separate an available capability from what is actually proposed, and a proposal from work already approved or completed.
- For consequential numbers, establish what is counted, over which dates, and against which denominator. Explain overlapping categories, attribution, and proxy measures where they could change the conclusion. A comparison of totals is not a matched cohort; a sequence of events is not proof of causation.
- Before recommending a setting or workflow change, check the actual path and prerequisites. If access or evidence is missing, state that specific gap and its consequence; do not present an assumed button or action as verified.
- Keep qualifications that could change the decision beside the claim, including on slides. Optional calculations and secondary questions can go in report details or speaker notes.

## Be concise without losing the answer

- Give each substantive point one main home. The opening can state a conclusion that the body proves; avoid restating the same explanation in a summary, findings, recommendation, decisions, and next steps.
- Use a short paragraph when it does the job. Add cards, tiles, tables, charts, or a separate section only when they make the material easier to understand. Do not fill component slots or aim for a section, word, or slide count.
- Delete generic background, ceremonial introductions and conclusions, empty sections, and repeated caveats. Mention missing information only when it affects the result or next action.
- Keep the main reading path complete: the answer, necessary reasoning, material uncertainty, and any actual action. Put supporting depth outside that path without hiding information the reader needs to decide.
- On revision, consolidate rather than accumulate. Replace superseded explanations, update the recommendation and action together, and distinguish open decisions from settled or deferred ones. Keep existing ids and recorded answers; move a settled card out of the open-decision group without breaking its anchor. Version history carries the old account unless a change itself matters to the reader.

## Be concrete and plain

- Say what you mean. Prefer a best estimate to a hedge ("about 40 orders a day", not "some orders"). Answer "how many?" before the reader asks.
- Define or avoid internal jargon. If a term needs a definition, give it the first time it appears.
- Name things precisely: the company ("Red Krypton", not "the team"), the product ("the app", not "the system"), people or roles for owners.
- **Bold the phrases that matter for the next decision** so a skimming reader catches them.

## Match the audience

- `data-audience="internal"`: engineering detail, file paths, commands, evidence labels, and sources are welcome.
- `data-audience="client"`: short and non-technical by default. Do not include internal provenance, internal task IDs, Slack links, agent or internal tool names (Codex, Claude, CodeRabbit, Asana, Kernel), generation notes, `.internal` blocks, or evidence pills. Naming the client's own systems (their Shopify, Meta, or CookieYes setup) is fine when the report is about them. Write in the company's voice ("Red Krypton will..."), not "I" or "me". Prefer phases (phase 1, 2, 3) over time estimates unless dates were requested.
- When the user asks for a readable plan for humans, keep the HTML high-level and put exhaustive implementation detail in a separate Markdown file if they want one.

## Visuals

- Product or UI work needs mockups: `.device` frames built with the product's own design language, or real screenshots.
- Compare like with like: mobile with mobile, the same component at the same size. Do not compare a full page with a cropped element.
- Use sharp images: capture at device pixel ratio 2 and crop to the region that matters; compress before referencing. Keep each inlined image under 300 KB.
- Data charts are Plotly charts (see Charts in `components.md`, and the templates for common shapes). The heading or slide title states the takeaway; the `figcaption` names the measure, unit, and period. Keep one y-axis and at most four series, start bars at zero, and show a legend only for two or more series. Label only the values that matter (the latest, the target, the outlier) and draw thresholds and events as shapes. Colour with `token:` names: grey for context, the accent or a tone for the point. Prefer a stacked bar to a pie. Put the data in the JSON, plus a `details` table when readers need exact numbers.
- Diagrams with branches or more than about five parts are Mermaid; a straight sequence of up to five steps is a `.flow`, phases are `.steps`, and a few simple comparisons can stay `.bars`.
- Show code, queries, configuration, and commands as code blocks with their language (`<pre><code class="language-sql">`) so the build colours them, and keep each to the lines that make the point.
- Keep key content visible. Use `details` only for optional depth such as queries or raw logs.

## Keep the document a single source of truth

- Revise the existing report in place rather than writing a new copy, and keep question ids stable across revisions so answers stay attached.
- When the reader answers questions in the editor, fold those answers into the plan's decisions on the next revision.
