// Brand kit browser checks, run from tests/browser.cjs: a report built with --brand takes its
// accent, text on accent, and heading and body fonts from the kit in light and dark, shows the
// logo for the colour scheme (data-theme and print included), and an unbranded report keeps the
// runtime's own values. With Plotly and Mermaid cached, live charts, snapshots, and diagrams use
// the brand's series and accent too.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DARK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=";
const STYLESHEET = ":root { --brand-accent: light-dark(#0a66ff, #66a3ff); --brand-on-accent: light-dark(#fffff0, #000010); "
  + "--brand-series-1: #ff0000; --brand-series-2: #00aa00; "
  + '--brand-font-body: "Trebuchet MS", system-ui, -apple-system, "Segoe UI", sans-serif; '
  + '--brand-font-heading: "Georgia", system-ui, -apple-system, "Segoe UI", sans-serif; }';
const kit = {
  id: "6f1c2a10-0000-4000-8000-000000000001", version: 3, stamp: "6f1c2a10-0000-4000-8000-000000000001@3", bundleFormat: 1,
  name: "Ozie", owner: { kind: "organization", id: "org-1", name: "Ozie Inc." },
  colors: { light: { accent: "#0a66ff", series: ["#ff0000", "#00aa00"] }, dark: { accent: "#66a3ff" } },
  typography: { body: "Trebuchet MS", heading: "Georgia", mono: null },
  logos: { light: `data:image/png;base64,${PNG}`, dark: `data:image/png;base64,${DARK_PNG}`, alt: "Ozie" },
  stylesheet: STYLESHEET
};
const SPEC = JSON.stringify({ data: [{ type: "bar", x: ["A", "B"], y: [1, 2] }], layout: {} });
const report = (media) => `<!doctype html>
<html lang="en" data-template="findings">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Branded</title>
</head>
<body>
<header class="hero">
  <p class="eyebrow">Investigation</p>
  <h1>Checkout errors doubled after the release</h1>
</header>
<main>
<section id="summary"><h2>At a glance</h2><p>Body text.</p>
<div class="options"><div class="option recommended"><h3>Roll back</h3><p>Now.</p></div></div>
</section>
${media ? `<section id="findings"><h2>Findings</h2>
<figure class="chart">
<script type="application/json" data-hr-chart>${SPEC}</script>
<figcaption>Orders by store</figcaption>
</figure>
<figure class="diagram">
<script type="text/x-mermaid" data-hr-diagram>flowchart LR
  a[Theme]:::accent --> b[Checkout]</script>
<figcaption>How orders flow</figcaption>
</figure>
</section>` : ""}
</main>
</body>
</html>
`;

module.exports = async function brandTests({ browser, root, pass, watch }) {
  const lib = (name) => import(pathToFileURL(path.resolve(__dirname, "../scripts/lib", name)).href);
  const { parseBrand } = await lib("brand.mjs");
  const { buildFile } = await lib("build.mjs");
  const { checkFile } = await lib("check.mjs");
  const dir = path.join(root, "brand");
  await fs.mkdir(dir, { recursive: true });
  const brand = parseBrand(kit);
  const files = {};
  for (const [name, options] of [["plain", {}], ["branded", { brand }]]) {
    const file = path.join(dir, `${name}.html`);
    await fs.writeFile(file, report(false));
    buildFile(file, options);
    assert.deepEqual(checkFile(file).errors, []);
    files[name] = pathToFileURL(file).href;
  }

  const read = (page) => page.evaluate(() => {
    const style = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
    const shown = (selector) => { const node = document.querySelector(selector); return Boolean(node) && getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0; };
    return {
      accent: style(".eyebrow").color, onAccent: style(".option.recommended", "::before").color,
      h1: style("h1").fontFamily, h2: style("h2").fontFamily, body: style("main p").fontFamily,
      light: shown(".brand-logo-light"), dark: shown(".brand-logo-dark")
    };
  });
  const BODY = '"Trebuchet MS", system-ui, -apple-system, "Segoe UI", sans-serif';
  const HEADING = 'Georgia, system-ui, -apple-system, "Segoe UI", sans-serif';
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = watch(page);
    await page.goto(files.branded);
    const branded = await read(page);
    assert.equal(branded.accent, scheme === "light" ? "rgb(10, 102, 255)" : "rgb(102, 163, 255)", `${scheme} accent from the brand`);
    assert.equal(branded.onAccent, scheme === "light" ? "rgb(255, 255, 240)" : "rgb(0, 0, 16)", `${scheme} text on accent from the brand`);
    assert.deepEqual([branded.h1, branded.h2, branded.body], [HEADING, HEADING, BODY], `${scheme} heading and body fonts from the brand`);
    assert.deepEqual([branded.light, branded.dark], [scheme === "light", scheme === "dark"], `${scheme} shows its own logo`);
    await page.evaluate((other) => document.documentElement.setAttribute("data-theme", other), scheme === "light" ? "dark" : "light");
    const flipped = await read(page);
    assert.deepEqual([flipped.light, flipped.dark], [scheme === "dark", scheme === "light"], "data-theme picks the logo");
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    await page.emulateMedia({ media: "print" });
    const printed = await read(page);
    assert.deepEqual([printed.light, printed.dark, printed.accent], [true, false, "rgb(10, 102, 255)"], "print uses the light logo and colours");
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: path.join(root, `brand-${scheme}.png`) });

    await page.goto(files.plain);
    const plain = await read(page);
    assert.equal(plain.accent, scheme === "light" ? "rgb(33, 85, 207)" : "rgb(132, 166, 255)", `${scheme} unbranded accent is unchanged`);
    assert.equal(plain.onAccent, scheme === "light" ? "rgb(255, 255, 255)" : "rgb(23, 26, 33)", `${scheme} unbranded text on accent is the surface`);
    assert.equal(plain.h1, plain.body, "unbranded headings inherit the body font");
    assert.match(plain.body, /^ui-sans-serif, system-ui/);
    assert.deepEqual([plain.light, plain.dark], [false, false]);
    assert.deepEqual(errors, []);
    await context.close();
  }
  pass("brand: accent, text on accent, heading and body fonts, and the logo follow the kit in light, dark, data-theme, and print; unbranded output is unchanged");

  const { ensureLibrary } = await lib("vendor.mjs");
  try {
    await ensureLibrary("plotly");
    await ensureLibrary("mermaid");
  } catch (error) {
    console.log(`SKIP brand charts: ${error.message}`);
    return;
  }
  const { renderMediaFile } = await lib("media.mjs");
  const runBrowser = async (fn) => {
    const context = await browser.newContext();
    try { return await fn(context); } finally { await context.close(); }
  };
  const file = path.join(dir, "charts.html");
  await fs.writeFile(file, report(true));
  const media = await renderMediaFile(file, { runBrowser, brand });
  assert.deepEqual(media.notes, []);
  buildFile(file, { brand });
  assert.deepEqual((await renderMediaFile(file, { runBrowser: async () => { throw new Error("nothing should be redrawn"); } })).drawn, { charts: 0, diagrams: 0 }, "a rebuild without --brand keeps the drawings");
  assert.deepEqual(checkFile(file).warnings.filter((w) => /chart|diagram/.test(w)), []);
  const source = await fs.readFile(file, "utf8");
  const snapshot = Buffer.from(/class="chart-static"[^>]*src="data:image\/svg\+xml;base64,([^"]+)"/.exec(source)[1], "base64").toString();
  assert.match(snapshot, /fill: rgb\(255, 0, 0\)/, "the snapshot draws the brand's first series");
  assert.match(snapshot, /Trebuchet MS/, "in the brand's body font");
  const diagram = /<div class="diagram-light">([\s\S]*?)<\/div><div class="diagram-dark">([\s\S]*?)<\/div><\/div>/.exec(source);
  assert.match(diagram[1], /\.node\.accent polygon\{stroke:rgb\(10, 102, 255\)/);
  assert.match(diagram[2], /\.node\.accent polygon\{stroke:rgb\(102, 163, 255\)/);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => document.querySelector("figure.chart.is-live"));
  assert.equal(await page.$eval(".chart-live .bars .point path", (bar) => getComputedStyle(bar).fill), "rgb(255, 0, 0)", "the live chart uses the brand's first series");
  assert.deepEqual(errors, []);
  await context.close();
  pass("brand: chart snapshots, live charts, and diagrams use the kit's series, accent, and font, and rebuilds keep them");
};
