# Writing rules

These rules come from repeated reviewer corrections on HTML plans and reports. Apply them to every template.

## Lead with what the reader must know or decide

- Put the answer, verdict, or recommendation first. Method and background come after.
- Put open questions and decisions near the top (the templates already do). A reader who stops after the first screen should know what is being proposed and what they must decide.
- Write each question as a complete sentence ending in a question mark, with enough context to answer it without reading the rest of the report: what it affects, the evidence, the recommended default, and links to the detailed sections. Never use fragments such as "Hosting?" or "Recovery point".
- Number questions `q1`, `q2`, ... so the reader can answer in a batch ("1 - yes, 2 - option B").

## Be concrete and plain

- Say what you mean. Prefer a best estimate to a hedge ("about 40 orders a day", not "some orders"). Answer "how many?" before the reader asks.
- Define or avoid internal jargon. If a term needs a definition, give it the first time it appears.
- Name things precisely: the company ("Red Krypton", not "the team"), the product ("the app", not "the system"), people or roles for owners.
- **Bold the phrases that matter for the next decision** so a skimming reader catches them.
- Remove sections that do not help the reader decide or act. Shorter is better; delete a template section rather than padding it.

## Match the audience

- `data-audience="internal"`: engineering detail, file paths, commands, evidence labels, and sources are welcome.
- `data-audience="client"`: short and non-technical by default. Do not include internal provenance, internal task IDs, Slack links, agent or internal tool names (Codex, Claude, CodeRabbit, Asana, Kernel), generation notes, `.internal` blocks, or evidence pills. Naming the client's own systems (their Shopify, Meta, or CookieYes setup) is fine when the report is about them. Write in the company's voice ("Red Krypton will..."), not "I" or "me". Prefer phases (phase 1, 2, 3) over time estimates unless dates were requested.
- When the user asks for a readable plan for humans, keep the HTML high-level and put exhaustive implementation detail in a separate Markdown file if they want one.

## Visuals

- Product or UI work needs mockups: `.device` frames built with the product's own design language, or real screenshots.
- Compare like with like: mobile with mobile, the same component at the same size. Do not compare a full page with a cropped element.
- Use sharp images: capture at device pixel ratio 2 and crop to the region that matters; compress before referencing. Keep each inlined image under 300 KB.
- Prefer CSS components (`.flow`, `.steps`, `.bars`) and small inline SVG over images for diagrams and charts.
- Keep key content visible. Use `details` only for optional depth such as queries or raw logs.

## Keep the document a single source of truth

- Revise the existing report in place rather than writing a new copy, and keep question ids stable across revisions so answers stay attached.
- When the reader answers questions in the editor, fold those answers into the plan's decisions on the next revision.
