// Section and slide template browser checks, run from tests/browser.cjs: every template renders
// without console errors or page overflow on desktop and phone in both colour schemes, its charts
// go live, and every slide template fits its slide.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = async function templateTests({ browser, root, pass, watch }) {
  const lib = (name) => import(pathToFileURL(path.resolve(__dirname, name)).href);
  const { ensureLibrary } = await lib("../scripts/lib/vendor.mjs");
  try {
    await ensureLibrary("plotly");
    await ensureLibrary("mermaid");
  } catch (error) {
    console.log(`SKIP templates: ${error.message}`);
    return;
  }
  const { writeTemplates } = await lib("templates.mjs");
  const { renderMediaFile } = await lib("../scripts/lib/media.mjs");
  const { buildFile } = await lib("../scripts/lib/build.mjs");
  const dir = path.join(root, "templates");
  await fs.mkdir(dir, { recursive: true });
  const files = writeTemplates(dir, { build: false });
  const runBrowser = async (fn) => {
    const context = await browser.newContext();
    try { return await fn(context); } finally { await context.close(); }
  };
  for (const file of Object.values(files)) {
    const media = await renderMediaFile(file, { runBrowser });
    assert.deepEqual(media.notes, []);
    buildFile(file);
  }
  const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  const live = (page) => page.waitForFunction(() => [...document.querySelectorAll("figure.chart")].every((f) => f.classList.contains("is-live")), null, { timeout: 20000 });

  for (const scheme of ["light", "dark"]) {
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(pathToFileURL(files.sections).href);
      await live(page);
      assert.ok(await noPageOverflow(page), `section templates overflow at ${width} ${scheme}`);
      await page.screenshot({ path: path.join(dir, `sections-${scheme}-${width}.png`), fullPage: true });
      await page.goto(pathToFileURL(files.slides).href);
      await live(page);
      await page.waitForTimeout(300);
      assert.ok(await noPageOverflow(page), `slide templates overflow at ${width} ${scheme}`);
      const cut = await page.evaluate(() => [...document.querySelectorAll(".slide[data-hr-overflow]")].map((s) => s.id));
      assert.deepEqual(cut, [], `slides cut off at ${width} ${scheme}`);
      await page.screenshot({ path: path.join(dir, `slides-${scheme}-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  pass("templates: all 20 section and 20 slide templates render in light and dark at 1280 and 390 px, charts go live, every slide fits");
};
