# Slide decks

Read this with `components.md` and `writing.md` when building `assets/templates/slides.html`. A deck is a report whose `<main class="deck">` holds a sequence of `<section class="slide">` elements. When a slide needs speaker notes, put them directly after it in `<aside class="notes">`; omit empty notes. The builder adds the deck runtime: slides scaled to fit, a review view with any notes under their slide, a present mode, and one-slide-per-page printing.

## Structure

Choose the sequence from the audience's purpose before copying layouts. Open with a cover that states the answer or promise; a short deck can make its main point there without a separate answer slide. There is no required seven-part arc or target slide count.

- A briefing can move from the result to the evidence and its implication, ending on the conclusion without an approval request.
- A proposal can show the practical change, compare alternatives, then ask for a decision. Include phases or a dedicated risk slide only when they help assess that choice.
- An analysis can follow the funnel, metric, or business question. Put the definitions and caveats that change its interpretation with the evidence.

Add, merge, reorder, or omit slides to fit that story. An agenda, options, phases, risks, and a closing ask are all conditional. When a decision is needed, make the requested action clear at the point where the audience can assess it.

## Writing slides

- **Every title is a takeaway sentence**, not a label: "Hybrid lowers migration risk, not operating complexity", not "Hybrid option". `check` warns on titles under four words, except cover and divider slides.
- **One idea per slide.** At most about 70 visible words (`check` warns above that) and at most five bullets; these are ceilings, not targets. Keep the main reasoning and decision-changing caveats visible. Move secondary explanation, source detail, and follow-up answers into notes. What actually overflows is titles over about 50 characters (they wrap to two lines), wrapped table rows, three-line cards, and more than four `.steps`. Check fit (below).
- **One component carries the slide**: `.tiles` for numbers, `.bignum` for the one number that matters, `.grid` of `.card` for 2 to 4 points (`.grid.three` or `.grid.four` for short ones), `.options` for a choice, `.matrix` for a 2×2, `.steps` for up to four phases, `.roadmap` for overlapping workstreams, `.compare` for two sides (give each side an `<h3>` to replace the Before/After labels; a `.flow` inside each side stacks vertically), `.flow` for up to five steps of how something works, a Plotly `figure.chart` for data, a Mermaid `figure.diagram` for architecture, `.bars` for simple comparisons, a `.table-wrap` table of at most five rows, `.agenda` for chapters, `.card.person` for people, `dl.terms` for terms, a `figure` screenshot, or `.device` mockups. A `.callout`, a closing `<p class="takeaway">` (the "so what" line, pinned to the bottom of the slide), or `<p class="footnotes">` (sources pinned to the bottom) can accompany the main component.
- The `.eyebrow` above each title names the topic in a few words ("The choice", "Why now").
- Voice for client decks: the company and product by name ("Red Krypton", "the app"), "we" for the team, never "I" or "me". Give best estimates instead of hedges and define any term the audience might not know.
- **Speaker notes** add what the presenter needs beyond the visible slide, such as a source or a likely follow-up answer; do not write a second report or repeat the slide verbatim. For a deck read without a presenter, make the slides understandable without opening notes. Notes are shown under each slide in the review view and hidden while presenting (N toggles them). Notes travel with the deck, so in a client deck keep them client-safe: no internal tool names, task IDs, or Slack links (`check` warns about tool names in client decks).

## Layouts

```html
<section class="slide cover" id="s1" data-toc="Cover">
  <p class="eyebrow">Prepared by Red Krypton for Gleamery · October 2026</p>
  <h1>Move bookings without losing a sale</h1>
  <p class="lede">What it would take to replace Boulevard, and the safer path.</p>
</section>
<aside class="notes"><p>Open with the decision we need today.</p></aside>

<section class="slide statement" id="s2" data-toc="The answer">
  <p class="eyebrow">The short version</p>
  <h2>Keep Boulevard for checkout and move scheduling first.</h2>
  <p>Scheduling transfers cleanly; checkout parity is a separate project.</p>
</section>
<aside class="notes"><p>If the meeting ended here, this is the message.</p></aside>

<section class="slide" id="s3" data-toc="Context">
  <p class="eyebrow">Where things stand</p>
  <h2>Boulevard is carrying four jobs behind one interface</h2>
  <div class="grid">
    <div class="card"><h3>Schedule engine</h3><p>Availability, booking, and rescheduling.</p></div>
    <div class="card"><h3>Checkout engine</h3><p>Pricing, deposits, packages, and credit.</p></div>
  </div>
</section>
<aside class="notes"><p>Each job maps to a different Dentrix capability.</p></aside>

<section class="slide divider" id="s9" data-toc="The ask">
  <p class="eyebrow">Next steps</p>
  <h2>Approve a two-week comparison of both operating models.</h2>
  <p>Red Krypton needs read access to Dentrix Ascend by Friday.</p>
</section>
<aside class="notes"><p>Close on the approval; offer the two-week plan as the fallback.</p></aside>
```

Give slides ids `s1`, `s2`, ... in order and a short `data-toc` label; the review view's navigation lists them. In a deck that was already shared, keep the ids: a new slide takes the next unused number. Use `<div class="spacer"></div>` to push a closing line to the bottom of a slide.

## Slide templates

`slide-templates.md` has copyable markup for each of these; read only the layouts that serve your outline. The catalogue order is not a presentation sequence.

| # | Template | Use for | Built from |
| --- | --- | --- | --- |
| 1 | Cover | Who it is for and from, and the promise | `cover`, `.meta`, `.footnotes` |
| 2 | Agenda | Navigation for a deck with distinct chapters, when useful | `.agenda` (`li.current`) |
| 3 | Decision requested | A real choice and the facts needed to assess it | `statement`, `.tiles` |
| 4 | Big number | One figure that carries the argument, with its reasons | `.bignum`, `.grid.center`, `.footnotes` |
| 5 | Funnel | Counts that narrow step by step, worst step marked | Plotly centred bars |
| 6 | Part to whole | Up to four parts of 100% | Plotly stacked bar |
| 7 | Trend | A measure over time against a target | Plotly columns, target line |
| 8 | Value ranges | Low-to-high estimates with a caveat | Plotly floating bars, `.callout` |
| 9 | Spectrum | Options between two extremes | Plotly one-axis scatter |
| 10 | Priority grid | Impact against effort, or likelihood against impact | `.matrix` (`data-x`, `data-y`) |
| 11 | Option detail | One slide per option before the comparison | `.tiles`, `.compare` with `.pros` and `.cons` |
| 12 | Comparison | Options against criteria with marks | table, cell tones, `col.recommended` |
| 13 | Open decisions | Decisions with owners and status | table, `.pill` |
| 14 | Gated phases | Phases, each with its exit criterion | `.grid.three` of `.card`, `.gate` |
| 15 | Current versus future | Two step-by-step paths | `.compare` with `.flow`, step tones |
| 16 | Architecture | Layers, with what is new and what is retired | Mermaid flowchart |
| 17 | Team | People, roles, and what they own | `.card.person` (`data-initials`) |
| 18 | Offer and terms | A price and the terms that go with it | `.bignum`, `dl.terms` |
| 19 | Closing ask | The one-sentence ask, next steps, and contacts | `divider`, `ol.checklist`, `.meta` |
| 20 | Sources | An appendix of sources after the ask | `.sources` |

## Images and mockups

- Screenshots go in a `figure` and are capped at about 300 px tall on the slide; crop to the region that matters.
- Phone mockups in `.device.phone` are scaled down on slides; put at most two side by side in `.devices`.
- Keep each image under 300 KB (see `components.md`) so decks stay light to share.

## Where decks live

Save decks next to the material they summarize, or in `docs/decks/YYYY-MM-DD-<slug>.html` inside a repository (`outputs/` otherwise). Relative links resolve from the deck's own folder, and `check` warns when one points at a missing file.

## Checking fit

Slides have a fixed size, so text that does not fit is cut off. After `report.mjs build`:

- With Playwright available: `NODE_PATH=<dir containing playwright> node "$HRB/scripts/fit.cjs" deck.html` lists every slide that is cut off (exit code 1) or confirms they all fit.
- With a browser tool: open the deck and look for red-outlined slides labelled "Content is cut off".
- `report.mjs pdf` checks fit again in the print layout and warns about any slide cut off in the PDF.

Fix a cut-off slide by shortening the title, trimming text into the notes, or splitting it in two.

## Review, present, print

- `report.mjs build` then open the file: slides appear stacked with notes beneath. A red outline marks a slide whose content is cut off; shorten it or split it.
- **Present**: click Present or press P. Arrow keys, Space, Page Up and Down, Home and End move; N shows notes; F toggles fullscreen; Esc exits. The address bar tracks the current slide (`#s4`).
- **On a phone or tablet**: the review view shows slides as readable cards with the slide list pinned at the top; the play icon at its right end presents from the slide in view. In present mode, swipe sideways or tap (the left third goes back, anywhere else goes forward). The controls sit along the bottom and hide after a few seconds; tap to bring them back. Back (the button or the edge swipe) exits present mode and returns to the slide being shown, not to the previous page. Android phones turn to landscape automatically; on an iPhone held upright, a hint suggests turning it sideways.
- **Print or PDF**: `report.mjs pdf deck.html` writes `deck.pdf` with one slide per page at 16:9, notes and review comments left out, and charts as sharp vectors; `--skip s3,s7` leaves slides out and `--out` names the file. The browser's print dialog gives the same pages (turn on background graphics).
- `report.mjs outline` lists every slide with its word count and whether it has notes.
- The local editor works on decks: click slide text or notes to edit them, widen the scope to a whole slide and rewrite it with AI, pin review comments to any slide (they stay hidden while presenting), or press Listen to hear each slide read with its speaker notes.
