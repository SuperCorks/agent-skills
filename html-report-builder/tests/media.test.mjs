import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { chartsIn, renderChartSnapshots } from "../scripts/lib/charts.mjs";
import { checkSource } from "../scripts/lib/check.mjs";
import { renderDiagrams, scrollable } from "../scripts/lib/diagrams.mjs";
import { renderMedia } from "../scripts/lib/media.mjs";
import { printableSource } from "../scripts/lib/pdf.mjs";
import { LIBRARIES, ensureLibrary, libraryPath, readLibrary } from "../scripts/lib/vendor.mjs";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "hr-media-test-"));
const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Charts</title>
</head>
<body>
<main>
<h1>Charts</h1>
${body}
</main>
</body>
</html>
`;
const SPEC = '{"data":[{"type":"bar","x":["A","B"],"y":[1,2]}],"layout":{}}';
const chart = (spec = SPEC, caption = "<figcaption>Orders by store</figcaption>") => `<figure class="chart">\n<script type="application/json" data-hr-chart>${spec}</script>\n${caption}\n</figure>`;
const DIAGRAM = "flowchart LR\n  a[Theme] --> b[Checkout]";
const diagram = (text = DIAGRAM) => `<figure class="diagram">\n<script type="text/x-mermaid" data-hr-diagram>${text}</script>\n<figcaption>How orders flow</figcaption>\n</figure>`;
const never = async () => { throw new Error("nothing should be drawn"); };
const svgFor = (items) => items.map((_, i) => `<svg xmlns="http://www.w3.org/2000/svg"><text>${i}</text></svg>`);
const drawings = (items) => items.map(() => ({
  light: '<svg id="d-light" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 812.5px;" viewBox="0 0 812.5 200"><g/></svg>',
  dark: '<svg id="d-dark" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 812.5px;" viewBox="0 0 812.5 200"><g/></svg>'
}));

test("libraries are verified against their pinned hash before use", async () => {
  const cacheDir = tmp();
  const bytes = Buffer.from("window.Fake = 1;\n");
  LIBRARIES.fake = { pkg: "fake-lib", version: "1.0.0", file: "dist/fake.js", sha256: createHash("sha256").update(bytes).digest("hex") };
  try {
    const serve = (body) => async (url) => {
      assert.equal(url, "https://cdn.jsdelivr.net/npm/fake-lib@1.0.0/dist/fake.js");
      return new Response(body);
    };
    await assert.rejects(ensureLibrary("fake", { cacheDir, fetch: serve("window.Fake = 'tampered';") }), /does not match its pinned hash/);
    assert.equal(existsSync(libraryPath("fake", cacheDir)), false, "a mismatched download is never written");
    await assert.rejects(ensureLibrary("fake", { cacheDir, fetch: async () => { throw new Error("offline"); } }), /one-time download.*offline/);
    const file = await ensureLibrary("fake", { cacheDir, fetch: serve(bytes) });
    assert.equal(readLibrary("fake", { cacheDir }), bytes.toString());
    assert.equal(await ensureLibrary("fake", { cacheDir, fetch: never }), file, "a verified copy is reused without fetching");
    writeFileSync(file, "window.Fake = 2;\n");
    assert.equal(readLibrary("fake", { cacheDir }), null, "an edited copy is not trusted");
  } finally {
    delete LIBRARIES.fake;
  }
});

test("chart snapshots are inserted once, refreshed when the spec changes, and removed with their chart", async () => {
  const seen = [];
  const render = async (items) => { seen.push(...items); return svgFor(items); };
  const first = await renderChartSnapshots(page(chart()), { render });
  assert.equal(first.rendered, 1);
  assert.deepEqual(seen[0], { spec: JSON.parse(SPEC), deck: false });
  assert.match(first.source, /<\/script><img class="chart-static" data-hr-generated="chart" data-hr-hash="[0-9a-f]{16}" alt="Orders by store" src="data:image\/svg\+xml;base64,/);
  assert.equal((await renderChartSnapshots(first.source, { render: never })).source, first.source, "an up-to-date snapshot is left alone");

  const changed = await renderChartSnapshots(first.source.replace("[1,2]", "[3,4]"), { render });
  assert.equal(changed.rendered, 1);
  assert.equal(changed.source.match(/chart-static/g).length, 1, "the old snapshot is replaced, not duplicated");
  assert.notEqual(chartsIn(changed.source)[0].hash, chartsIn(first.source)[0].hash);
  assert.equal((await renderChartSnapshots(changed.source, { render, force: true })).rendered, 1);

  const orphan = await renderChartSnapshots(changed.source.replace(/<script type="application\/json" data-hr-chart>[\s\S]*?<\/script>/, ""), { render: never });
  assert.doesNotMatch(orphan.source, /chart-static/, "a snapshot without its chart is removed");

  await renderChartSnapshots(page(`<section class="slide" id="s1">${chart()}</section>`), { render });
  assert.equal(seen.at(-1).deck, true, "charts on slides draw at the slide's size");
});

test("chart snapshot problems are notes, never failures", async () => {
  const invalid = await renderChartSnapshots(page(chart("{not json")), { render: never });
  assert.match(invalid.notes.join("\n"), /a chart's JSON is invalid/);
  assert.equal(invalid.rendered, 0);
  const failing = await renderChartSnapshots(page(chart()), { render: async () => { throw new Error("Chrome closed"); } });
  assert.deepEqual(failing.notes, ["chart snapshots were not updated: Chrome closed"]);
  assert.doesNotMatch(failing.source, /chart-static/);
});

test("diagrams are drawn in light and dark, kept until the source changes, and scroll on phones", async () => {
  const seen = [];
  const render = async (items) => { seen.push(...items); return drawings(items); };
  const first = await renderDiagrams(page(diagram()), { render });
  assert.equal(first.rendered, 1);
  assert.equal(seen[0].source, DIAGRAM);
  assert.match(seen[0].id, /^hrd-[0-9a-f]{16}$/);
  assert.match(first.source, /<div class="diagram-svg" data-hr-generated="diagram" data-hr-hash="[0-9a-f]{16}"><div class="diagram-light"><svg id="d-light"[^>]*style="max-width: 812.5px; min-width: min\(812.5px, 40rem\);"/);
  assert.match(first.source, /<div class="diagram-dark"><svg id="d-dark"/);
  assert.equal((await renderDiagrams(first.source, { render: never })).source, first.source);

  const changed = await renderDiagrams(first.source.replace("b[Checkout]", "b[Headless checkout]"), { render });
  assert.equal(changed.rendered, 1);
  assert.equal(changed.source.match(/class="diagram-svg"/g).length, 1);

  const broken = await renderDiagrams(page(diagram("flowchart LR\n  a -->")), { render: async (items) => items.map(() => ({ error: "Parse error on line 2" })) });
  assert.deepEqual(broken.notes, ["a diagram could not be drawn: Parse error on line 2"]);
  assert.doesNotMatch(broken.source, /diagram-svg/);
  assert.equal(scrollable('<svg width="100%" style="max-width: 300px;">'), '<svg width="100%" style="max-width: 300px; min-width: min(300px, 40rem);">');
});

test("the build opens a browser only when something is stale, and keeps going without one", async () => {
  let opened = 0;
  const runBrowser = async () => { opened++; throw new Error("no Chrome"); };
  const plain = await renderMedia(page("<p>No charts.</p>"), { runBrowser, loadLibrary: never });
  assert.equal(plain.changed, false);

  const offline = await renderMedia(page(chart()), { runBrowser, loadLibrary: async () => { throw new Error("charts and diagrams need a one-time download"); } });
  assert.equal(offline.changed, false);
  assert.match(offline.notes.join("\n"), /one-time download/);
  assert.equal(opened, 0);

  const library = path.join(tmp(), "lib.js");
  writeFileSync(library, "window.Plotly = {};");
  const noChrome = await renderMedia(page(chart()), { runBrowser, loadLibrary: async () => library });
  assert.equal(opened, 1);
  assert.equal(noChrome.changed, false);
  assert.match(noChrome.notes.join("\n"), /were not redrawn: no Chrome/);
});

test("check: chart JSON, figures, captions, snapshots, diagrams, and the inlined Plotly", async () => {
  const built = (body) => buildSource(page(body)).output;
  const result = (body) => checkSource(built(body));
  assert.match(result(chart("{not json")).errors.join("\n"), /chart "Orders by store" has invalid JSON/);
  assert.match(result(`<div><script type="application/json" data-hr-chart>${SPEC}</script></div>`).errors.join("\n"), /must sit directly inside a <figure class="chart">/);
  assert.match(result(chart(SPEC, "")).warnings.join("\n"), /chart 1 has no <figcaption>/);
  assert.match(result(chart()).warnings.join("\n"), /missing or stale snapshot/);

  const drawn = (await renderChartSnapshots(page(chart()), { render: async (items) => svgFor(items) })).source;
  const fresh = checkSource(buildSource(drawn).output);
  assert.doesNotMatch(fresh.warnings.join("\n"), /snapshot/);
  assert.match(checkSource(buildSource(drawn.replace("[1,2]", "[5,6]")).output).warnings.join("\n"), /missing or stale snapshot/);

  assert.match(result(diagram()).warnings.join("\n"), /diagram 1 has a missing or stale drawing/);
  const rendered = (await renderDiagrams(page(diagram()), { render: async (items) => drawings(items) })).source;
  const clean = checkSource(buildSource(rendered).output);
  assert.doesNotMatch(clean.warnings.join("\n"), /drawing|authored script/);
  assert.deepEqual(clean.errors, []);
  assert.match(result(`<div><script type="text/x-mermaid" data-hr-diagram>${DIAGRAM}</script></div>`).errors.join("\n"), /diagram 1 must sit directly inside a <figure class="diagram">/);

  const fake = built("<p>Text.</p>").replace("</main>", '</main>\n<script data-hr-runtime="plotly">window.Plotly = {};</script>');
  assert.match(checkSource(fake).errors.join("\n"), /the inlined Plotly is not the pinned release/);
});

test("the build inlines the pinned Plotly only while the report has charts", { skip: readLibrary("plotly") === null && "Plotly is not cached" }, () => {
  const charted = buildSource(page(chart())).output;
  assert.match(charted, /<script data-hr-runtime="plotly" data-hr-lib="plotly\.js-cartesian-dist-min@4\.1\.2">/);
  assert.match(charted, /HRCharts/);
  assert.deepEqual(checkSource(charted).errors, []);
  const plain = buildSource(charted.replace(/<figure class="chart">[\s\S]*?<\/figure>/, "<p>No chart now.</p>")).output;
  assert.doesNotMatch(plain, /data-hr-runtime="plotly"|HRCharts/);
});

test("pdf: skipped slides and their notes are hidden, and links resolve beside the original", () => {
  const deck = buildSource(`<!doctype html>
<html lang="en" data-template="slides">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Deck</title></head>
<body>
<main class="deck">
<section class="slide cover" id="s1"><h1>Move bookings safely</h1></section>
<aside class="notes"><p>Open.</p></aside>
<section class="slide" id="s2"><h2>The second slide makes one point</h2></section>
<aside class="notes"><p>Second.</p></aside>
</main>
</body>
</html>
`).output;
  const printable = printableSource(deck, { skip: ["s2", "#s9"], baseHref: "file:///tmp/decks/" });
  assert.equal(printable.deck, true);
  assert.deepEqual(printable.missing, ["s9"]);
  assert.match(printable.source, /<section hidden class="slide" id="s2">/);
  assert.match(printable.source, /<aside hidden class="notes"><p>Second/);
  assert.doesNotMatch(printable.source, /<section hidden class="slide cover"/);
  assert.match(printable.source, /<head><base href="file:\/\/\/tmp\/decks\/">/);
});
