// Assemble a sample deck from the ```html snippets in references/slides.md plus slides that
// exercise each component, for browser tests and visual review. Run directly to write one:
//   node tests/deck.mjs [dir]   (prints the deck.html path; defaults to a temp folder)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFile } from "../scripts/lib/build.mjs";
import { SKILL_DIR } from "../scripts/lib/runtime.mjs";
import { isEntrypoint } from "../scripts/report.mjs";
import { screenshotPng } from "./gallery.mjs";

const slide = (n, toc, eyebrow, title, body, notes) => `<section class="slide" id="s${n}" data-toc="${toc}">
  <p class="eyebrow">${eyebrow}</p>
  <h2>${title}</h2>
  ${body}
</section>
<aside class="notes"><p>${notes}</p></aside>`;

export function deckSource() {
  const guide = readFileSync(path.join(SKILL_DIR, "references/slides.md"), "utf8");
  const snippets = [...guide.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1].trim()).join("\n");
  const [opening, closing] = snippets.split(/(?=<section class="slide divider")/);
  const middle = [
    slide(4, "Numbers", "Why now", "Failed syncs cost about forty orders a week", `<div class="tiles">
    <div class="tile risk"><span>Failed nights</span><b>4.1%</b><small>last 30 days</small></div>
    <div class="tile"><span>Orders affected</span><b>~40</b><small>per week</small></div>
    <div class="tile ok"><span>Fix effort</span><b>3 phases</b><small>parallel after phase 1</small></div>
  </div>`, "Numbers come from the September sync logs."),
    slide(5, "Options", "The choice", "A job queue fixes the failures without new vendors", `<div class="options">
    <article class="option"><h3>A. Keep cron</h3><ul class="pros"><li>No new infrastructure</li></ul><ul class="cons"><li>Failures stay silent</li></ul></article>
    <article class="option recommended"><h3>B. Job queue</h3><ul class="pros"><li>Retries and alerts</li></ul><ul class="cons"><li>One more service</li></ul></article>
  </div>`, "Option B costs one small service; the retries pay for it in a week."),
    slide(6, "The path", "How we get there", "We earn each phase with evidence from the last", `<ol class="steps">
    <li class="ok"><h3>Phase 1: Queue the sync</h3><p>Nightly runs green for a week.</p></li>
    <li><h3>Phase 2: Alerts</h3><p>Alert after 24 hours of retries.</p></li>
    <li><h3>Phase 3: Backfill</h3><p>Recover the missed orders.</p></li>
  </ol>`, "Phases, not dates: each gate is a measurable result."),
    slide(7, "Before and after", "The experience", "Reordering drops from three taps to one", `<div class="compare">
    <figure class="before"><p>Three taps and a search to reorder.</p></figure>
    <figure class="after"><p>One tap from the order card.</p></figure>
  </div>`, "Mobile compared with mobile."),
    slide(8, "Screens", "What it looks like", "Shoppers see sync status on every order", `<div class="devices">
    <figure><div class="device phone"><div class="mock-screen"><h3 class="mock-title">Orders</h3><p>Last sync: 2 minutes ago</p><p>Order #1042 · Synced</p></div></div><figcaption>Orders list</figcaption></figure>
    <figure><img src="deck.assets/screen.png" alt="Admin screen"><figcaption>Admin view</figcaption></figure>
  </div>`, "The badge reuses the existing status pill."),
    slide(9, "Results", "Early signal", "Checkout recovers fastest once retries land", `<div class="bars">
    <div style="--v:.62"><span>Checkout</span><b>62%</b></div>
    <div class="risk" style="--v:.18"><span>Search</span><b>18%</b></div>
    <div class="ok" style="--v:.84"><span>Account</span><b>84%</b></div>
    <div style="--v:.1"><span>Exports</span><b>Documentation only</b></div>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Area</th><th class="num">Before</th><th class="num">After</th></tr></thead><tbody><tr><td>Checkout</td><td class="num">41%</td><td class="num">62%</td></tr></tbody></table></div>
  <p class="takeaway">Checkout is where the money is, so it goes first.</p>`, "Pilot data from the staging store."),
    slide(10, "Roadmap", "Workstreams", "Checkout parity overlaps the first two phases", `<div class="roadmap">
    <div class="scale"><span></span><small><span>Phase 1</span><span>Phase 2</span><span>Phase 3</span></small></div>
    <div style="--from:0;--to:.4"><span>Scheduling</span><b>Phase 1</b></div>
    <div class="warn" style="--from:.3;--to:.75"><span>Checkout parity</span><b>Phases 1-2</b></div>
    <div style="--from:.6;--to:1"><span>Reporting</span><b>Phase 3</b></div>
  </div>`, "Bars show overlap, not exact dates.")
  ].join("\n\n");
  const renumbered = closing.replace('id="s9"', 'id="s11"');
  return `<!doctype html>
<html lang="en" data-template="slides" data-audience="client">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sample deck</title>
<style>
.mock-screen { padding: 18px; }
.mock-title { margin: 0 0 8px; font-size: 20px; }
</style>
</head>
<body>
<main class="deck">
${opening.trim()}

${middle}

${renumbered.trim()}
</main>
</body>
</html>
`;
}

/** Write deck.html (and its screenshot) into dir and build it in place. */
export function writeDeck(dir) {
  mkdirSync(path.join(dir, "deck.assets"), { recursive: true });
  writeFileSync(path.join(dir, "deck.assets", "screen.png"), screenshotPng(480, 300));
  const file = path.join(dir, "deck.html");
  writeFileSync(file, deckSource());
  buildFile(file);
  return file;
}

if (isEntrypoint(import.meta.url)) {
  const dir = path.resolve(process.argv[2] || mkdtempSync(path.join(os.tmpdir(), "hr-deck-")));
  console.log(writeDeck(dir));
}
