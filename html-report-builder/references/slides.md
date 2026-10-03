# Slide decks

Read this with `components.md` and `writing.md` when building `assets/templates/slides.html`. A deck is a report whose `<main class="deck">` holds a sequence of `<section class="slide">` elements, each followed by its speaker notes in `<aside class="notes">`. The builder adds the deck runtime: slides scaled to fit, a review view with notes under each slide, a present mode, and one-slide-per-page printing.

## Structure

The default arc, from past executive and client decks:

1. **Cover** (`slide cover`): who it is for and from, the promise in under ten words.
2. **The answer** (`slide statement`): the recommendation or conclusion in one sentence.
3. **Context**: what is true today, with numbers.
4. **Options**: the choice, with the recommended option marked.
5. **The path**: phases (phase 1, 2, 3), not calendar estimates unless dates were requested.
6. **Risks**: the two or three that matter and how they are contained.
7. **The ask** (`slide divider`): one sentence the audience can say yes to, then next steps.

Add, merge, or drop middle slides to fit the story; keep the cover first and the ask last. Aim for 6 to 14 slides.

## Writing slides

- **Every title is a takeaway sentence**, not a label: "Hybrid lowers migration risk, not operating complexity", not "Hybrid option". `check` warns on titles under four words, except cover and divider slides.
- **One idea per slide.** At most about 70 visible words (`check` warns above that) and at most five bullets. Move explanation, sources, caveats, and likely questions into the notes.
- **One component carries the slide**: `.tiles` for numbers, `.grid` of `.card` for 2 to 4 points (`.grid.three` for 3 to 4 short ones), `.options` for a choice, `.steps` for phases, `.compare` for before and after, `.flow` for how something works, `.bars` for comparisons, a `.table-wrap` table of at most five rows, a `figure` screenshot, or `.device` mockups.
- The `.eyebrow` above each title names the topic in a few words ("The choice", "Why now").
- Voice for client decks: the company and product by name ("Red Krypton", "the app"), "we" for the team, never "I" or "me". Give best estimates instead of hedges and define any term the audience might not know.
- **Speaker notes** say what the presenter would say, where each number comes from, and the likely questions with short answers. Notes are shown under each slide in the review view and hidden while presenting (N toggles them).

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

Give slides ids `s1`, `s2`, ... in order and a short `data-toc` label; the review view's navigation lists them. Use `<div class="spacer"></div>` to push a closing line to the bottom of a slide.

## Images and mockups

- Screenshots go in a `figure` and are capped at about 300 px tall on the slide; crop to the region that matters.
- Phone mockups in `.device.phone` are scaled down on slides; put at most two side by side in `.devices`.
- Keep each image under 300 KB (see `components.md`) so decks stay light to share.

## Review, present, print

- `report.mjs build` then open the file: slides appear stacked with notes beneath. A red outline marks a slide whose content is cut off; shorten it or split it.
- **Present**: click Present or press P. Arrow keys, Space, Page Up and Down, Home and End move; N shows notes; F toggles fullscreen; Esc exits. The address bar tracks the current slide (`#s4`).
- **Print or PDF**: the browser's print dialog gives one slide per page at 16:9 with notes hidden. Turn on background graphics.
- `report.mjs outline` lists every slide with its word count and whether it has notes.
- The local editor works on decks: click slide text or notes to edit them, or widen the scope to a whole slide and rewrite it with AI.
