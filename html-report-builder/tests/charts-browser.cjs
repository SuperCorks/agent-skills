// Chart and diagram browser checks, run from tests/browser.cjs: live Plotly charts replace their
// build snapshots, hover lands on the right point (also on zoomed and presented slides), print
// and readers without JavaScript get the snapshot, dark mode redraws, diagrams follow the colour
// scheme, and phones get report-sized charts and diagrams that scroll instead of shrinking.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const columns = JSON.stringify({
  data: [{ type: "bar", x: MONTHS, y: [2.9, 2.7, 2.5, 2.3, 2.1, 1.9], hovertemplate: "%{x}: %{y}<extra></extra>" }],
  layout: { yaxis: { ticksuffix: "%" } }
});
const trend = JSON.stringify({
  data: [{ type: "scatter", mode: "lines", x: Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`), y: Array.from({ length: 30 }, (_, i) => (i < 10 ? 40 : 180) + (i % 3) * 6) }],
  layout: { yaxis: { rangemode: "tozero" } }
});
const flow = "flowchart LR\n  theme[Shopify theme] --> checkout[Headless checkout]:::new --> queue[Webhook queue] --> netsuite[NetSuite] --> warehouse[Warehouse]";
const page = (title, attrs, main) => `<!doctype html>
<html lang="en"${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body>
${main}
</body>
</html>
`;
const figure = (spec, caption) => `<figure class="chart">\n<script type="application/json" data-hr-chart>${spec}</script>\n<figcaption>${caption}</figcaption>\n</figure>`;
const report = page("Charts", "", `<main>
<h1>Chart checks</h1>
<section id="trend">
<h2>Card errors jumped after the release</h2>
${figure(trend, "Daily card errors at checkout, September 2026")}
</section>
<section id="columns">
<h2>Conversion has fallen five months in a row</h2>
${figure(columns, "Checkout conversion by month, 2026")}
</section>
<section id="flow">
<h2>How order data flows after the pilot</h2>
<figure class="diagram">
<script type="text/x-mermaid" data-hr-diagram>${flow}</script>
<figcaption>Order data after the pilot</figcaption>
</figure>
</section>
</main>`);
const deck = page("Deck", ' data-template="slides" data-audience="internal"', `<main class="deck">
<section class="slide cover" id="s1"><h1>Move checkout to a headless pilot</h1></section>
<aside class="notes"><p>Open.</p></aside>
<section class="slide" id="s2">
<h2>Conversion has fallen five months in a row</h2>
${figure(columns, "Checkout conversion by month, 2026")}
</section>
<aside class="notes"><p>The trend.</p></aside>
</main>`);

/* Hover the middle of each bar in a live chart and read the hover label it shows. */
async function hoverBars(page, scope) {
  await page.locator(`${scope} figure.chart`).scrollIntoViewIfNeeded();
  const bars = await page.$$eval(`${scope} .chart-live .bars .point path`, (paths) => paths.map((p) => {
    const r = p.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.6 };
  }));
  const labels = [];
  for (const bar of bars) {
    await page.mouse.move(bar.x, bar.y);
    await page.waitForTimeout(150);
    labels.push(await page.$eval(`${scope} .chart-live`, (live) => live.querySelector(".hoverlayer").textContent));
  }
  return labels;
}
const months = (labels) => labels.map((label) => MONTHS.find((m) => label.startsWith(m)) || label);
const visible = (page, selector) => page.$$eval(selector, (nodes) => nodes.map((n) => getComputedStyle(n).display !== "none" && n.getBoundingClientRect().width > 0));

module.exports = async function chartTests({ browser, root, pass, watch }) {
  const lib = (name) => import(pathToFileURL(path.resolve(__dirname, "../scripts/lib", name)).href);
  const { ensureLibrary } = await lib("vendor.mjs");
  try {
    await ensureLibrary("plotly");
    await ensureLibrary("mermaid");
  } catch (error) {
    console.log(`SKIP charts: ${error.message}`);
    return;
  }
  const { renderMediaFile } = await lib("media.mjs");
  const { buildFile } = await lib("build.mjs");
  const { checkFile } = await lib("check.mjs");
  const dir = path.join(root, "charts");
  await fs.mkdir(dir, { recursive: true });
  const runBrowser = async (fn) => {
    const context = await browser.newContext();
    try { return await fn(context); } finally { await context.close(); }
  };
  const files = {};
  const paths = {};
  for (const [name, source] of [["report", report], ["deck", deck]]) {
    const file = path.join(dir, `${name}.html`);
    await fs.writeFile(file, source);
    const media = await renderMediaFile(file, { runBrowser });
    assert.deepEqual(media.notes, []);
    buildFile(file);
    const checked = checkFile(file);
    assert.deepEqual(checked.errors, []);
    assert.deepEqual(checked.warnings.filter((w) => /chart|diagram|Plotly/.test(w)), []);
    files[name] = pathToFileURL(file).href;
    paths[name] = file;
  }
  pass("charts: the build draws snapshots and diagrams, inlines Plotly, and check is clean");

  {
    const { pdfFile } = await lib("pdf.mjs");
    const pages = async (file) => (await fs.readFile(file, "latin1")).match(/\/Type\s*\/Page[^s]/g).length;
    const printed = await pdfFile(paths.deck, { out: path.join(dir, "deck.pdf"), runBrowser });
    assert.deepEqual(printed.cut, []);
    assert.equal(await pages(printed.file), 2);
    const overfull = path.join(dir, "overfull.html");
    await fs.writeFile(overfull, (await fs.readFile(paths.deck, "utf8")).replace("</h1>", `</h1>${"<p>A line that pushes the cover past its bottom edge.</p>".repeat(14)}`));
    const cut = await pdfFile(overfull, { out: path.join(dir, "overfull.pdf"), skip: ["s2"], runBrowser });
    assert.deepEqual(cut.cut, ["s1"], "a slide cut off in print is reported");
    assert.equal(await pages(cut.file), 1, "--skip leaves the slide out");
    pass("pdf: one page per slide, --skip leaves slides out, and slides cut off in print are reported");
  }

  let lightTicks;
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = watch(page);
    await page.goto(files.report);
    await page.waitForFunction(() => document.querySelectorAll("figure.chart.is-live").length === 2);
    assert.deepEqual(await visible(page, ".chart-static"), [false, false], "the live chart replaces its snapshot");
    assert.deepEqual(months(await hoverBars(page, "#columns")), MONTHS);
    const plot = await page.locator("#trend .chart-live .nsewdrag").boundingBox();
    await page.mouse.move(plot.x + plot.width * 0.8, plot.y + plot.height / 2);
    await page.waitForTimeout(150);
    assert.match(await page.$eval("#trend .hoverlayer", (layer) => layer.textContent), /Sep 2\d, 2026/);
    const ticks = await page.$eval("#columns .xtick text", (text) => getComputedStyle(text).fill);
    if (scheme === "light") lightTicks = ticks;
    else assert.notEqual(ticks, lightTicks, "dark mode redraws the chart in dark colours");
    assert.deepEqual(await visible(page, ".diagram-light"), [scheme === "light"]);
    assert.deepEqual(await visible(page, ".diagram-dark"), [scheme === "dark"]);
    if (scheme === "light") {
      await page.emulateMedia({ media: "print" });
      assert.deepEqual(await visible(page, ".chart-static"), [true, true], "print uses the snapshot");
      assert.deepEqual(await visible(page, ".chart-live"), [false, false]);
      await page.emulateMedia({ media: "screen" });
    }
    assert.deepEqual(errors, []);
    pass(`charts ${scheme}: live charts, hover on bars and lines, diagram follows the scheme${scheme === "light" ? ", print shows snapshots" : ", colours redraw"}`);
    await context.close();
  }

  {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(files.report);
    await page.waitForFunction(() => [...document.querySelectorAll(".chart-static")].every((img) => img.complete && img.naturalWidth > 0));
    assert.deepEqual(await visible(page, ".chart-static"), [true, true]);
    assert.equal(await page.locator(".chart-live").count(), 0);
    pass("charts with JavaScript off: the snapshots are the charts");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = watch(page);
    await page.goto(files.report);
    await page.waitForFunction(() => document.querySelectorAll("figure.chart.is-live").length === 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "the page does not overflow");
    const diagram = await page.$eval(".diagram-light", (box) => ({ scroll: box.scrollWidth, client: box.clientWidth }));
    assert.ok(diagram.scroll > diagram.client, `the wide diagram scrolls inside its figure (${JSON.stringify(diagram)})`);
    await page.goto(files.deck);
    await page.waitForFunction(() => document.querySelector("figure.chart.is-live"));
    assert.equal(await page.$eval("#s2 .xtick text", (text) => text.style.fontSize), "13px", "a reflowed slide charts at report size");
    assert.deepEqual(errors, []);
    pass("charts on a phone: no overflow, the diagram scrolls, reflowed slides chart at report size");
    await context.close();
  }

  for (const [width, height, present] of [[900, 800, false], [1920, 1080, true]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = watch(page);
    await page.goto(files.deck);
    await page.waitForFunction(() => document.querySelector("figure.chart.is-live"));
    if (present) {
      await page.keyboard.press("p");
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector("#s2.hr-current"));
      await page.waitForTimeout(400);
    }
    const zoom = await page.$eval("#s2 .chart-live", (live) => live.currentCSSZoom);
    assert.ok(Math.abs(zoom - 1) > 0.05, `the slide is zoomed (${zoom})`);
    assert.equal(await page.$eval("#s2 .xtick text", (text) => text.style.fontSize), "18px", "slides chart at their design size");
    assert.deepEqual(months(await hoverBars(page, "#s2")), MONTHS);
    const clipped = await page.$eval("#s2 .chart-live", (live) => {
      const left = live.querySelector(".main-svg").getBoundingClientRect().left;
      return [...live.querySelectorAll(".ytick text")].filter((t) => t.getBoundingClientRect().left < left).length;
    });
    assert.equal(clipped, 0, "axis labels stay inside the chart");
    assert.deepEqual(errors, []);
    pass(`charts on a ${present ? "presented" : "zoomed"} slide (zoom ${zoom.toFixed(2)}): hover lands on each bar, labels fit`);
    await context.close();
  }
};
