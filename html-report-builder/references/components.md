# Components

Write plain semantic HTML with these classes. Do not write CSS or JavaScript: `report.mjs build` inlines the shared runtime. Unknown classes get no styling and `check` warns about them. Mockup-only styles are the exception: put them in one `<style>` in `<head>` whose selectors all use `.mock-*` classes (`check` warns about any other selector). Never reuse a component class name such as `.options` or `.card` inside a mockup.

Tone modifiers `ok`, `warn`, `risk`, `info` work on `callout`, `pill`, `tile`, `question`, `finding`, `steps > li`, and `bars > div`. A `callout` without a tone is neutral.

Evidence pills (internal reports only) say how a claim is known:

| Pill | Meaning |
| --- | --- |
| `observed` | Seen directly in code, data, logs, or the product |
| `executed` | Confirmed by running a test, query, or command during this work |
| `inferred` | Reasoned from evidence, not directly seen |
| `unknown` | Not established; say what would settle it |

Page attributes on `<html>`: `data-template="plan|findings|brief"`, `data-audience="internal|client"`, optional `data-numbered` (numbers sections and their TOC entries), `data-toc="off"`, `data-theme="light|dark"` (otherwise follows the system).

Components that add their own labels (`.rec` "Recommendation", `.owner` "Owner:", `.links` "Details:", `.answer` "Answer", `.compare` "Before"/"After", `.option.recommended`) must not repeat those words in their text.

## Page skeleton

The TOC is generated from every `<section id>` in `<main>` that has an `<h2>`. `data-toc` sets a shorter TOC label. The `.meta` row takes any label/value pairs (status, date, owner, stack, client).

```html
<header class="hero">
  <p class="eyebrow">Implementation plan</p>
  <h1>Move subscriber sync to the job queue</h1>
  <p class="lede">One-paragraph north star.</p>
  <dl class="meta"><div><dt>Status</dt><dd>Draft</dd></div><div><dt>Owner</dt><dd>Red Krypton</dd></div></dl>
</header>
<main>
  <section id="scope" data-toc="Scope"><h2>Scope and non-goals</h2><p>Text.</p></section>
</main>
```

## Tiles (at a glance, KPIs)

`span` is the label, `b` the value, `small` an optional note. Keep values to a number or about three words and use three to five tiles; put context (such as "down from 26.0%") in `small`.

```html
<div class="tiles">
  <div class="tile"><span>Recommendation</span><b>Option B</b><small>queue-based sync</small></div>
  <div class="tile risk"><span>Failed jobs</span><b>4.1%</b><small>last 30 days</small></div>
  <div class="tile ok"><span>Effort</span><b>3 phases</b></div>
</div>
```

## Question card

Number ids `q1`, `q2`, ... in document order; the page shows "Q1" from the order. The title is a full question. `.rec`, `.owner`, `.links`, and `.answer` add their own labels; keep `.answer` empty for the reader to fill in the editor.

```html
<article class="question" id="q1">
  <h3>Should failed syncs retry automatically for 24 hours before alerting?</h3>
  <p>Retries hide short provider outages but delay alerts. This sets the alert rule in phase 2.</p>
  <p class="rec">Yes: retry with backoff for 24 hours, then alert. Most failures clear within 2 hours.</p>
  <p class="owner">Client operations lead</p>
  <p class="links"><a href="#phases">Phase 2</a> · <a href="#risks">Alert fatigue risk</a></p>
  <p class="answer"></p>
</article>
```

## Finding card

Number ids `f1`, `f2`, ... Tone sets severity: `risk` high, `warn` medium, no tone low or informational, `ok` healthy, no issue, or already fixed. State confidence (high, medium, low) when the evidence supports one; if the source gives none, omit it rather than guess. Lead with one sentence, then use a short list for evidence.

```html
<article class="finding risk" id="f1">
  <h3>Rate limiting causes the nightly failures</h3>
  <p><span class="pill risk">High</span> <span class="pill observed">Observed</span> Confidence: high</p>
  <p>Evidence: 212 of 214 failures return HTTP 429 (<code>logs/sync-2026-09.csv</code>).</p>
</article>
```

## Callout and pills

```html
<div class="callout warn"><p><b>Heads up:</b> the migration locks the orders table for about 2 minutes.</p></div>
<div class="callout ok"><p><b>Verified:</b> the fix holds in staging.</p></div>
<p><span class="pill ok">Done</span> <span class="pill warn">At risk</span> <span class="pill risk">Blocked</span> <span class="pill info">Planned</span> <span class="pill">Neutral</span></p>
```

## Cards and grid

`.grid` fits two cards per row on desktop and one on mobile. `.grid.three` and `.grid.four` give exactly three or four columns on wide screens for short cards.

```html
<div class="grid">
  <div class="card"><h3>In scope</h3><ul><li>Sync worker</li></ul></div>
  <div class="card"><h3>Not in scope</h3><ul><li>Billing changes</li></ul></div>
</div>
<div class="grid four">
  <div class="card"><h3>Schedule</h3><p>Booking</p></div><div class="card"><h3>Checkout</h3><p>Payments</p></div>
  <div class="card"><h3>Events</h3><p>Webhooks</p></div><div class="card"><h3>Data</h3><p>Reports</p></div>
</div>
```

## Table

Always wrap tables. `.num` right-aligns numbers.

```html
<div class="table-wrap"><table>
  <thead><tr><th>Check</th><th>Expected</th><th class="num">Count</th></tr></thead>
  <tbody><tr><td>Orders synced</td><td>Matches the admin report</td><td class="num">1,204</td></tr></tbody>
</table></div>
```

## Steps, timeline, lanes

`ol.steps` for sequential phases; tone on an `li` marks state. `.timeline` replaces numbers with dots and a `time`. `.lanes` shows parallel work, on its own or inside a step.

```html
<ol class="steps">
  <li class="ok"><h3>Phase 1: Queue the sync</h3><p>Move the job to the queue. Exit when nightly runs are green for a week.</p></li>
  <li><h3>Phase 2: Alerts</h3><p>Alert after 24 hours of retries.</p></li>
</ol>
<ol class="steps timeline">
  <li><time>Aug 4, 09:12</time><p>First 429 response.</p></li>
  <li><time>Aug 4, 09:40</time><p>Retries exhausted.</p></li>
</ol>
<div class="lanes">
  <div class="lane"><h4>Backend (parallel)</h4><p>Queue worker.</p></div>
  <div class="lane"><h4>Frontend (parallel)</h4><p>Status badge.</p></div>
</div>
```

## Flow diagram

Arrows are drawn between items; on mobile the flow stacks vertically. Keep it to five items or fewer; use `.steps` for longer sequences.

```html
<ol class="flow">
  <li>Storefront<small>checkout event</small></li>
  <li>API</li>
  <li>Queue</li>
  <li>Sync worker</li>
</ol>
```

## Compare (before and after)

Compare like with like: mobile with mobile, the same region at the same size. The "Before" and "After" labels are automatic; start a side with its own `<h3>` (for example "Today" and "Hybrid") to replace them.

```html
<div class="compare">
  <figure class="before"><p>Current: three taps to reorder.</p></figure>
  <figure class="after"><p>Proposed: one tap from the order card.</p></figure>
</div>
```

## Options

Mark one `.recommended`. When alternatives are one-liners without pros and cons, use a table instead.

```html
<div class="options">
  <article class="option"><h3>A. Keep cron</h3><ul class="pros"><li>No new infrastructure</li></ul><ul class="cons"><li>Failures stay silent</li></ul></article>
  <article class="option recommended"><h3>B. Job queue</h3><ul class="pros"><li>Retries and alerts</li></ul><ul class="cons"><li>One more service</li></ul></article>
</div>
```

## Checklist

```html
<ul class="checklist">
  <li class="done">Queue worker deployed to staging</li>
  <li>Alert rule reviewed by the client</li>
</ul>
```

## Bars and progress

`--v` is a fraction from 0 to 1. Bars start at zero on the left, and every row's track lines up even when the `b` values differ in length. For ratings without numbers, put the rating in `b` ("Medium") and set `--v` to its rank.

```html
<div class="bars">
  <div style="--v:.62"><span>Checkout</span><b>62%</b></div>
  <div class="risk" style="--v:.18"><span>Search</span><b>18%</b></div>
</div>
<p>Rollout <progress value="0.4">40%</progress></p>
```

## Roadmap

Overlapping workstreams on one timeline: `--from` and `--to` are fractions of the whole span. An optional `.scale` row labels the span.

```html
<div class="roadmap">
  <div class="scale"><span></span><small><span>Phase 1</span><span>Phase 2</span><span>Phase 3</span></small></div>
  <div style="--from:0;--to:.4"><span>Scheduling</span><b>Phase 1</b></div>
  <div class="warn" style="--from:.3;--to:.75"><span>Checkout parity</span><b>Phases 1-2</b></div>
  <div style="--from:.6;--to:1"><span>Reporting</span><b>Phase 3</b></div>
</div>
```

## Device frames for mockups

Frames stay light in dark mode. `.phone` is at most 390 px wide; `.desktop` fills the column. Inside a frame, build the mockup with plain HTML and `.mock-*` classes that follow the product's design system. Put labels in a `figcaption` outside the frame, and pair or group frames in `.devices` so they align at the top.

```html
<div class="device phone">
  <div class="mock-screen"><h3 class="mock-title">Orders</h3><p>Last sync: 2 minutes ago</p></div>
</div>
<div class="device desktop">
  <div class="mock-screen"><p>Admin dashboard mockup</p></div>
</div>
```

```html
<div class="devices">
  <figure><div class="device phone"><div class="mock-screen"><p>Concept A</p></div></div><figcaption>Concept A, initial state</figcaption></figure>
  <figure><div class="device phone"><div class="mock-screen"><p>Concept B</p></div></div><figcaption>Concept B, initial state</figcaption></figure>
</div>
```

```html
<style>
.mock-screen { padding: 16px; }
.mock-title { margin: 0 0 8px; font-size: 18px; }
</style>
```

## Figures and screenshots

Reference image files with a relative path; `build` inlines them for local reports (keeping the path in `data-hr-src`) and `export` turns them back into files for publishing. To replace or compress an image after a build, change the file at the `data-hr-src` path and rebuild. On macOS, `sips -Z 1600 in.png --out in.png` resizes and `sips -s format jpeg -s formatOptions 80 in.png --out in.jpg` compresses (then update the path).

```html
<figure>
  <img src="2026-10-03-sync-plan.assets/orders-mobile.png" alt="Orders screen on mobile showing the sync badge">
  <figcaption>Current orders screen, iPhone 15 width.</figcaption>
</figure>
```

## Sources list

```html
<ul class="sources">
  <li><a href="https://shopify.dev/docs/api/functions">Shopify Functions docs</a><small>Discount function limits, checked 2026-09-08</small></li>
  <li><code>theme/sections/kit-builder.liquid</code><small>Current kit picker</small></li>
</ul>
```

## Details and internal notes

Use `details` only for optional depth, never for key content. `.internal` marks notes that must not reach a client; `check` fails client reports that contain one.

```html
<details><summary>Query used</summary><pre><code>select count(*) from sync_runs where status = 'failed';</code></pre></details>
<div class="internal"><p>Confirm pricing with Simon before sharing.</p></div>
```

## Inline text

Use `<strong>` for decision-relevant phrases, `<code>` for paths and identifiers, `<mark>` sparingly for a highlight, `<small>` or `.muted` for secondary text, and `<kbd>` for keys.

```html
<p>The client must <strong>approve the alert rule by Friday</strong>. The worker lives in <code>apps/sync/worker.ts</code>; <mark>staging only</mark> for now. <span class="muted">Press <kbd>Cmd</kbd>+<kbd>K</kbd> in the editor.</span></p>
```
