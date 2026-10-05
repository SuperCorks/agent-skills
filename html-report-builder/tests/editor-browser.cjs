// Editor browser checks, run from tests/browser.cjs. With HR_CORPUS_LIST set, also compares
// Chromium's text for every editable block with the server's view on real reports.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = async function editorTests({ browser, root, pass, watch }) {
  const skill = path.resolve(__dirname, "..");
  const load = (relative) => import(pathToFileURL(path.join(skill, relative)).href);
  const { startEditor } = await load("editor/report-editor.mjs");
  const { buildSource } = await load("scripts/lib/build.mjs");
  const { locate } = await load("editor/blocks.mjs");
  const { normalizeText, textContent } = await load("scripts/lib/scan.mjs");

  const dir = path.join(root, "editor");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "report.html");
  const source = buildSource(`<!doctype html>
<html lang="en" data-template="plan">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Editor browser test</title>
</head>
<body>
<header class="hero"><p class="eyebrow">Plan</p><h1>Editor browser test</h1><p class="lede">North star sentence.</p></header>
<main>
<section id="scope"><h2>Scope</h2><p id="para">Sync the orders nightly. See <a href="https://example.com/docs">the docs</a>.</p></section>
<section id="questions"><h2>Questions</h2>
<article class="question" id="q1"><h3>Should failed syncs retry for a day?</h3><p>Retries hide short outages.</p><p class="rec">Yes.</p><p class="answer"></p></article>
</section>
<section id="risks"><h2>Risks</h2><p>Rate limits may return.</p></section>
</main>
</body>
</html>
`).output;
  await fs.writeFile(file, source);
  const prompts = [];
  const editor = await startEditor({
    file, port: 0, settings: { provider: "codex", model: "gpt-6-luna", effort: "low" },
    configFile: path.join(dir, "config.json"), backupDir: path.join(dir, "backup"), pollMs: 100, log: () => {},
    rewrite: async (settings, { prompt }) => {
      prompts.push(prompt);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const fragment = prompt.split("Fragment to rewrite:\n")[1];
      return { html: fragment.replace("Retries hide short outages.", "Retries hide <strong>brief</strong> provider outages."), provider: "mock", model: settings.model, ms: 300 };
    }
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = watch(page);
  const read = () => fs.readFile(file, "utf8");
  const shadow = (id) => page.locator(`#hre-host >> css=#${id}`);
  const waitFile = async (predicate, timeout = 5000) => {
    const started = Date.now();
    while (!predicate(await read())) {
      if (Date.now() - started > timeout) throw new Error("timed out waiting for the file to change");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  try {
    await page.goto(editor.url);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    assert.equal(await read(), source);

    await page.click("#para", { position: { x: 30, y: 10 } });
    assert.equal(await page.getAttribute("#para", "contenteditable"), "plaintext-only");
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("para"));
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.type(" Weekly too.");
    await page.keyboard.press("Enter");
    await waitFile((text) => text.includes("Weekly too."));
    const afterEdit = await read();
    assert.equal(afterEdit, source.replace('<a href="https://example.com/docs">the docs</a>.</p>', '<a href="https://example.com/docs">the docs</a>. Weekly too.</p>'));
    assert.equal(await page.getAttribute("#para", "contenteditable"), null);
    pass("editor: click, type, Enter saves only that paragraph");

    await page.click("#para a");
    assert.equal(new URL(page.url()).hostname, "127.0.0.1", "links inside blocks do not navigate while editing");
    await page.keyboard.type("zzz");
    await page.keyboard.press("Escape");
    assert.equal(await read(), afterEdit);
    assert.doesNotMatch(await page.textContent("#para"), /zzz/);
    pass("editor: links stay put and Escape cancels without saving");

    await page.click("#q1 .answer");
    await page.keyboard.type("Yes, retry with backoff.");
    await page.click("#risks p");
    await waitFile((text) => text.includes('<p class="answer">Yes, retry with backoff.</p>'));
    await page.keyboard.press("Escape");
    pass("editor: answers typed into the answer slot are saved when focus moves on");

    await page.click("#q1 > p:not(.rec):not(.answer)");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const crumbs = [...document.getElementById("hre-host").shadowRoot.querySelectorAll(".crumb")];
      crumbs.find((c) => c.textContent === "article#q1").click();
    });
    assert.ok(await page.evaluate(() => document.getElementById("q1").classList.contains("hre-scope")));
    await shadow("ai").click();
    await shadow("instruction").fill("Use plainer words.");
    await shadow("run").click();
    await page.waitForFunction(() => !document.getElementById("hre-host").shadowRoot.getElementById("result").hidden);
    assert.match(prompts.at(-1), /Instruction: Use plainer words\./);
    assert.match(prompts.at(-1), /<article class="question" id="q1">/);
    assert.ok(await page.evaluate(() => document.querySelector("#q1.hre-preview") !== null), "proposal previewed in place");
    const diff = await page.evaluate(() => [...document.getElementById("hre-host").shadowRoot.querySelectorAll("#diff ins, #diff del")].map((n) => `${n.tagName}:${n.textContent.trim()}`));
    assert.deepEqual(diff, ["DEL:short", "INS:brief provider"]);
    const beforeAccept = await read();
    await Promise.all([page.waitForEvent("load"), shadow("accept").click()]);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    assert.equal(await read(), beforeAccept.replace("Retries hide short outages.", "Retries hide <strong>brief</strong> provider outages."));
    pass("editor: AI rewrite of a widened scope previews a diff and applies on Accept");

    await Promise.all([page.waitForEvent("load"), shadow("undo").click()]);
    assert.equal(await read(), beforeAccept);
    pass("editor: Undo restores the previous file");

    const reloaded = page.waitForEvent("load");
    await fs.writeFile(file, (await read()).replace("Rate limits may return.", "Rate limits were fixed upstream."));
    await reloaded;
    await page.waitForFunction(() => document.body.textContent.includes("Rate limits were fixed upstream."));
    pass("editor: an outside change to the file reloads the page");

    const beforeDelete = await read();
    const box = await page.locator("#q1").boundingBox();
    await page.mouse.click(box.x + box.width - 6, box.y + 6);
    assert.ok(await page.evaluate(() => document.getElementById("q1").classList.contains("hre-scope")), "clicking beside the text selects the card");
    assert.equal(await page.getAttribute("#q1", "contenteditable"), null);
    await shadow("delete").hover();
    assert.ok(await page.evaluate(() => document.getElementById("q1").classList.contains("hre-doomed")), "hovering Delete previews what goes");
    await Promise.all([page.waitForEvent("load"), shadow("delete").click()]);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    assert.equal(await read(), beforeDelete.replace(/<article class="question" id="q1">.*<\/article>\n/, ""));
    assert.match(await shadow("toast").textContent(), /Deleted article#q1\. ⌘Z to undo\./);
    await Promise.all([page.waitForEvent("load"), page.keyboard.press("Meta+z")]);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    assert.equal(await read(), beforeDelete);
    pass("editor: clicking beside text selects a card, Delete removes it, and Cmd+Z brings it back");

    await page.click("#para");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const crumbs = [...document.getElementById("hre-host").shadowRoot.querySelectorAll(".crumb")];
      crumbs.find((c) => c.textContent === "section#scope").click();
    });
    await Promise.all([page.waitForEvent("load"), page.keyboard.press("Backspace")]);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    const withoutScope = await read();
    assert.doesNotMatch(withoutScope, /id="scope"|href="#scope"/, "the section and its TOC entry are gone");
    assert.equal(await page.locator("#questions").count(), 1);
    await Promise.all([page.waitForEvent("load"), shadow("undo").click()]);
    await page.waitForFunction(() => document.getElementById("hre-host"));
    assert.equal(await read(), beforeDelete);
    pass("editor: a section selected from the breadcrumbs is deleted with the Delete key");

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: path.join(root, "editor-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click("#para");
    await shadow("ai").click();
    await page.screenshot({ path: path.join(root, "editor-desktop.png") });
    assert.deepEqual(errors, []);
    pass("editor: no console errors; toolbar fits a 390 px screen");
  } finally {
    await context.close();
    await editor.close();
  }

  if (!process.env.HR_CORPUS_LIST) return;
  const files = (await fs.readFile(process.env.HR_CORPUS_LIST, "utf8")).split("\n").filter(Boolean);
  const limit = Number(process.env.HR_CORPUS_LIMIT || 60);
  const sample = files.filter((_, index) => index % Math.max(1, Math.floor(files.length / limit)) === 0).slice(0, limit);
  let blocks = 0;
  const mismatches = [];
  const corpusContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const report of sample) {
    const copy = path.join(dir, `corpus-${blocks}-${path.basename(report)}`);
    await fs.copyFile(report, copy);
    const instance = await startEditor({ file: copy, port: 0, settings: {}, configFile: path.join(dir, "c.json"), backupDir: path.join(dir, "backup"), pollMs: 60_000, log: () => {} });
    const corpusPage = await corpusContext.newPage();
    try {
      await corpusPage.goto(instance.url, { waitUntil: "domcontentloaded" });
      const browserTexts = await corpusPage.evaluate(() => {
        const out = {};
        for (const element of document.querySelectorAll('[data-hre^="b"]')) {
          const clone = element.cloneNode(true);
          clone.querySelectorAll("[data-hr-ui]").forEach((n) => n.remove());
          out[element.dataset.hre] = clone.textContent.replace(/[ \s]+/g, " ").trim();
        }
        return out;
      });
      const text = await fs.readFile(copy, "utf8");
      for (const [id, value] of Object.entries(browserTexts)) {
        blocks++;
        const found = locate(text, id);
        const server = found ? normalizeText(textContent(found.doc, found.element)) : null;
        if (server !== value) mismatches.push({ report, id, server: server && server.slice(0, 80), browser: value.slice(0, 80) });
      }
    } finally {
      await corpusPage.close();
      await instance.close();
    }
  }
  await corpusContext.close();
  console.log(`corpus: ${sample.length} reports, ${blocks} editable blocks, ${mismatches.length} text mismatches`);
  if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 10), null, 2));
  assert.equal(mismatches.length, 0);
  pass(`editor corpus: Chromium and the server agree on all ${blocks} block texts in ${sample.length} real reports`);
};
