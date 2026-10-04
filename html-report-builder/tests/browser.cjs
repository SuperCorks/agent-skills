// Browser checks for the report runtime (and the editor, when present). Requires Playwright;
// never uses a user profile. Run: NODE_PATH=/path/to/node_modules node tests/browser.cjs
// Screenshots are written to the printed temp folder for visual review.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hr-browser-"));
  const { writeGallery } = await import(pathToFileURL(path.join(__dirname, "gallery.mjs")));
  const galleryFile = writeGallery(root);
  const galleryUrl = pathToFileURL(galleryFile).href;
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  const pass = (name) => { checks++; console.log(`PASS ${name}`); };
  const watch = (page) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => errors.push(`request failed ${request.url()}`));
    return errors;
  };
  try {
    for (const scheme of ["light", "dark"]) {
      for (const [label, width, height] of [["desktop", 1280, 900], ["mobile", 390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = watch(page);
        await page.goto(galleryUrl);
        const overflow = await page.evaluate(() => {
          const wide = [];
          for (const element of document.querySelectorAll("main *")) {
            const rect = element.getBoundingClientRect();
            if (rect.right > document.documentElement.clientWidth + 1 && !element.closest(".table-wrap, pre, .toc")) wide.push(element.tagName + "." + element.className);
          }
          return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, wide: wide.slice(0, 5) };
        });
        assert.ok(overflow.scroll <= overflow.client, `${scheme} ${label} overflow ${JSON.stringify(overflow)}`);
        assert.deepEqual(errors, []);
        const device = await page.evaluate(() => getComputedStyle(document.querySelector(".device")).backgroundColor);
        assert.equal(device, "rgb(255, 255, 255)", "device frames stay light");
        const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.equal(body === "rgb(14, 16, 20)", scheme === "dark", `body background follows ${scheme} scheme (${body})`);
        await page.screenshot({ path: path.join(root, `gallery-${scheme}-${label}.png`), fullPage: true });
        pass(`gallery ${scheme} ${label}: no overflow, no console errors`);
        await context.close();
      }
    }

    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = watch(page);
      await page.goto(galleryUrl);
      assert.equal(await page.locator("pre .hr-copy").count() > 0, true, "copy buttons injected");
      await page.evaluate(() => document.getElementById("c-checklist").scrollIntoView({ behavior: "instant" }));
      await page.waitForFunction(() => document.querySelector(".toc a[aria-current]")?.getAttribute("href") === "#c-checklist", null, { timeout: 5000 });
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".toc").isVisible(), false, "TOC hidden in print");
      assert.deepEqual(errors, []);
      pass("runtime: copy buttons, TOC scrollspy, print hides navigation");
      await page.close();
    }

    {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(galleryUrl);
      assert.equal(await page.locator("h1").textContent(), "Component gallery");
      assert.ok(await page.locator(".toc a").count() > 5, "static TOC works without JS");
      assert.equal(await page.locator(".hr-copy").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      pass("JS disabled: content and TOC render, no overflow");
      await context.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = watch(page);
      const html = await fs.readFile(galleryFile, "utf8");
      await page.setContent(`<iframe sandbox="allow-scripts" style="width:100%;height:860px;border:0"></iframe>`);
      await page.$eval("iframe", (frame, srcdoc) => { frame.srcdoc = srcdoc; }, html);
      const frame = await (await page.$("iframe")).contentFrame();
      await frame.waitForSelector("pre .hr-copy", { state: "attached" });
      assert.equal(await frame.locator("h1").textContent(), "Component gallery");
      assert.deepEqual(errors, []);
      pass("sandboxed iframe (Kernel-like, no storage): runtime runs");
      await page.close();
    }

    const deckTests = path.join(__dirname, "deck-browser.cjs");
    if (await fs.stat(deckTests).then(() => true, () => false)) await require(deckTests)({ browser, root, pass, watch });
    const editorTests = path.join(__dirname, "editor-browser.cjs");
    if (await fs.stat(editorTests).then(() => true, () => false)) await require(editorTests)({ browser, root, pass, watch });
    console.log(`\n${checks} browser checks passed. Screenshots: ${root}`);
  } catch (error) {
    console.error(error);
    console.error(`Artifacts: ${root}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
