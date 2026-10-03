#!/usr/bin/env node
// Report slides whose content is cut off (the deck runtime's data-hr-overflow flag) by
// rendering the deck in headless Chromium. Needs Playwright:
//   NODE_PATH=/path/to/node_modules node fit.cjs deck.html
// Exits 1 when any slide overflows, 2 when Playwright or the file is unavailable.
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("Usage: fit.cjs <deck.html>"); process.exit(2); }
  let chromium;
  try { ({ chromium } = require("playwright")); } catch {
    console.error("Playwright is not available; set NODE_PATH to a node_modules folder that has it, or open the deck in a browser and look for red-outlined slides.");
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(pathToFileURL(path.resolve(file)).href);
    await page.waitForLoadState("load");
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => [...document.querySelectorAll(".slide")].map((slide, i) => ({
      n: i + 1, id: slide.id, cut: slide.hasAttribute("data-hr-overflow"),
      by: Math.max(0, slide.scrollHeight - slide.clientHeight),
      title: (slide.querySelector("h1, h2")?.textContent || "").trim().slice(0, 70)
    })));
    if (!result.length) { console.error("No .slide elements found; is this a slides deck built with report.mjs?"); process.exitCode = 2; return; }
    const cut = result.filter((s) => s.cut);
    for (const s of cut) console.log(`CUT OFF: slide ${s.n} #${s.id} by about ${s.by} px  ${s.title}`);
    console.log(cut.length ? `${cut.length} of ${result.length} slides are cut off: shorten them or move detail into the notes.` : `All ${result.length} slides fit.`);
    process.exitCode = cut.length ? 1 : 0;
  } finally {
    await browser.close();
  }
})();
