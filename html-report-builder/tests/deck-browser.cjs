// Slide deck browser checks, run from tests/browser.cjs.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = async function deckTests({ browser, root, pass, watch }) {
  const skill = path.resolve(__dirname, "..");
  const { writeDeck } = await import(pathToFileURL(path.join(skill, "tests/deck.mjs")).href);
  const dir = path.join(root, "deck");
  const file = writeDeck(dir);
  const url = pathToFileURL(file).href;
  const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  for (const [scheme, width, height] of [["light", 1280, 900], ["dark", 1440, 900], ["light", 1120, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = watch(page);
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector(".hr-deck-ui"));
    assert.ok(await noPageOverflow(page), `${scheme} ${width}: page overflows`);
    const state = await page.evaluate(() => {
      const main = document.querySelector("main.deck").getBoundingClientRect();
      const slides = [...document.querySelectorAll(".slide")];
      return {
        cut: slides.filter((s) => s.hasAttribute("data-hr-overflow")).map((s) => s.id),
        widest: Math.max(...slides.map((s) => s.getBoundingClientRect().width)), main: main.width,
        ratio: slides[2].getBoundingClientRect().width / slides[2].getBoundingClientRect().height
      };
    });
    assert.deepEqual(state.cut, [], "no slide content is cut off");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".toc .hr-toc-present")).display), "none", "no play icon beside the sidebar contents");
    assert.ok(state.widest <= state.main + 1, `slides fit the column (${state.widest} > ${state.main})`);
    assert.ok(Math.abs(state.ratio - 16 / 9) < 0.02, `slides keep 16:9 (${state.ratio})`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(root, `deck-review-${scheme}-${width}.png`) });
    pass(`deck review ${scheme} ${width}px: slides fit at 16:9, nothing cut off, no errors`);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(url);
    assert.ok(await noPageOverflow(page));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".slide")).zoom), "1", "phones reflow slides instead of shrinking them");
    await page.screenshot({ path: path.join(root, "deck-mobile.png"), fullPage: false });
    await page.evaluate(() => document.getElementById("s5").scrollIntoView({ behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector(".toc").scrollLeft > 0);
    const play = await page.evaluate(() => { const r = document.querySelector(".toc .hr-toc-present").getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; });
    assert.ok(play.right <= 390 && play.left > 300 && play.top < 20, `the play icon stays pinned at the right of the top bar (${JSON.stringify(play)})`);
    await page.click(".toc .hr-toc-present");
    await page.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    assert.equal(await page.evaluate(() => document.querySelector(".slide.hr-current").id), "s5", "the play icon presents from the slide in view");
    pass("deck on a phone: slides reflow as readable cards without overflow, and the top bar's play icon presents");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = watch(page);
    const cdp = await context.newCDPSession(page);
    const swipe = async (fromX, toX, y = 200) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
      for (const step of [0.33, 0.66, 1]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fromX + (toX - fromX) * step, y: y + 8 * step }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const current = () => page.evaluate(() => document.querySelector(".slide.hr-current")?.id ?? null);
    const ui = () => page.evaluate(() => {
      const bar = document.querySelector(".hr-deck-ui");
      const rect = bar.getBoundingClientRect();
      return { opacity: getComputedStyle(bar).opacity, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, bottom: rect.bottom, hint: getComputedStyle(bar.querySelector(".hr-deck-hint")).display };
    });
    await page.goto(url);
    assert.ok(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), "the context emulates a touch screen");
    await page.tap(".hr-deck-ui button[data-act=present]");
    await page.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    assert.equal(await current(), "s1");
    const bar = await ui();
    assert.equal(bar.opacity, "1", "touch controls are fully visible");
    assert.ok(Math.abs(bar.x - 422) < 2 && bar.bottom > 340, `touch controls sit at the bottom centre (${JSON.stringify(bar)})`);
    assert.equal(bar.hint, "none", "no rotate hint in landscape");

    await swipe(600, 200);
    assert.equal(await current(), "s2", "swipe left moves forward");
    await swipe(200, 600);
    assert.equal(await current(), "s1", "swipe right moves back");
    await page.touchscreen.tap(700, 150);
    await page.touchscreen.tap(700, 150);
    assert.equal(await current(), "s3", "a tap on the right moves forward");
    await page.touchscreen.tap(100, 150);
    assert.equal(await current(), "s2", "a tap on the left third moves back");
    await page.tap(".hr-deck-ui button[data-act=notes]");
    const notes = await page.evaluate(() => { const r = document.querySelector(".slide.hr-current + .notes").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(notes.x, notes.y);
    assert.equal(await current(), "s2", "taps on the notes do not move");
    await page.tap(".hr-deck-ui button[data-act=notes]");

    await page.waitForFunction(() => document.documentElement.classList.contains("hr-idle"), null, { timeout: 5000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".hr-deck-ui")).opacity === "0");
    await page.touchscreen.tap(bar.x, bar.y);
    assert.equal(await current(), "s2", "the first tap on hidden controls only shows them");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".hr-deck-ui")).opacity === "1");
    await page.tap(".hr-deck-ui button[data-act=next]");
    assert.equal(await current(), "s3");
    await page.screenshot({ path: path.join(root, "deck-present-touch.png") });

    await page.goBack();
    await page.waitForFunction(() => !document.documentElement.classList.contains("hr-presenting"));
    assert.ok(page.url().startsWith(url), "Back exits present mode without leaving the deck");
    assert.equal(await page.evaluate(() => location.hash), "#s3");
    await page.waitForFunction(() => Math.abs(document.getElementById("s3").getBoundingClientRect().top) < 100);

    await page.tap(".hr-deck-ui button[data-act=present]");
    await page.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    await swipe(600, 200);
    const shown = await current();
    await page.tap(".hr-deck-ui button[data-act=exit]");
    await page.waitForFunction((id) => !document.documentElement.classList.contains("hr-presenting") && location.hash === `#${id}`, shown);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => location.hash), `#${shown}`, "exiting keeps the address on the slide shown last");
    const top = await page.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top), shown);
    assert.ok(top >= 0 && top < 100, `exiting scrolls review to the slide shown last (top ${top})`);
    assert.deepEqual(errors, []);
    pass("deck present mode on touch: swipes and taps navigate, controls hide when idle, Back and exit return to review");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(url);
    await page.tap(".hr-deck-ui button[data-act=present]");
    await page.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".hr-deck-hint")).display), "block", "portrait phones get a rotate hint");
    await page.screenshot({ path: path.join(root, "deck-present-portrait.png") });
    pass("deck present mode on a portrait phone: hint to turn the phone sideways");
    await context.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = watch(page);
    await page.goto(url);
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.textContent = "Overflowing detail. ".repeat(120);
      document.getElementById("s3").append(p);
    });
    await page.waitForFunction(() => document.getElementById("s3").hasAttribute("data-hr-overflow"));
    pass("deck: a slide whose content is cut off is flagged in review");

    await page.evaluate(() => document.getElementById("s4").scrollIntoView({ block: "start", behavior: "instant" }));
    await page.keyboard.press("p");
    await page.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    const present = await page.evaluate(() => {
      const visible = [...document.querySelectorAll(".slide")].filter((s) => getComputedStyle(s).display !== "none");
      const rect = visible[0].getBoundingClientRect();
      return { ids: visible.map((s) => s.id), w: rect.width, h: rect.height, n: visible[0].getAttribute("data-hr-n"), toc: getComputedStyle(document.querySelector(".toc")).display };
    });
    assert.deepEqual(present.ids, ["s4"]);
    assert.equal(present.n, "4");
    assert.ok(Math.abs(present.w - 1280) < 2 || Math.abs(present.h - 900) < 2, "the slide fills the viewport");
    assert.equal(present.toc, "none");
    await page.mouse.click(1000, 450);
    assert.equal(await page.evaluate(() => document.querySelector(".slide.hr-current").id), "s4", "mouse clicks on a slide do not navigate");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => location.hash), "#s5");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.querySelector(".slide.hr-current").id), "s11");
    await page.keyboard.press("Home");
    await page.keyboard.press("n");
    assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector(".slide.hr-current + .notes")).display !== "none"), "N shows notes");
    await page.screenshot({ path: path.join(root, "deck-present.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("hr-presenting")), false);
    assert.deepEqual(errors, []);
    pass("deck present mode: P starts at the slide in view, keys navigate, N shows notes, Esc exits");

    await page.emulateMedia({ media: "print" });
    const printed = await page.evaluate(() => {
      const slide = document.querySelector(".slide");
      return { breakAfter: getComputedStyle(slide).breakAfter, zoom: getComputedStyle(slide).zoom, notes: getComputedStyle(document.querySelector(".notes")).display, ui: getComputedStyle(document.querySelector(".hr-deck-ui")).display };
    });
    assert.deepEqual(printed, { breakAfter: "page", zoom: "1", notes: "none", ui: "none" });
    pass("deck print: one slide per page at full size, notes and controls hidden");
    await page.close();
  }

  for (const width of [1120, 1440, 900]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(url);
    assert.ok(await noPageOverflow(page), `JS off at ${width}px overflows`);
    assert.ok(await page.evaluate(() => document.querySelectorAll(".slide").length === 11));
    await context.close();
  }
  pass("deck with JavaScript off: every slide renders and fits at 900, 1120, and 1440 px");

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url);
    const lefts = await page.evaluate(() => [...document.querySelectorAll("#s9 .bars > div > b")].map((b) => Math.round(b.getBoundingClientRect().left)));
    assert.equal(new Set(lefts).size, 1, `bar values share one column (${lefts})`);
    const fit = require("node:child_process").spawnSync(process.execPath, [path.join(skill, "scripts/fit.cjs"), file], { encoding: "utf8", env: process.env });
    assert.equal(fit.status, 0, fit.stdout + fit.stderr);
    assert.match(fit.stdout, /All 11 slides fit/);
    await page.close();
  }
  pass("deck: bar tracks align across rows and fit.cjs confirms every slide fits");

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = watch(page);
    await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:760px;border:0"></iframe>');
    await page.$eval("iframe", (frame, srcdoc) => { frame.srcdoc = srcdoc; }, await fs.readFile(file, "utf8"));
    const frame = await (await page.$("iframe")).contentFrame();
    await frame.waitForSelector(".hr-deck-ui button[data-act=present]");
    await frame.click(".hr-deck-ui button[data-act=present]");
    await frame.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    await frame.click(".hr-deck-ui button[data-act=next]");
    assert.ok(await frame.evaluate(() => document.querySelector(".slide.hr-current") !== null));
    assert.deepEqual(errors, []);
    pass("deck in a sandboxed iframe (Kernel-like): presenting works without fullscreen or storage");
    await page.close();
  }

  const { startEditor } = await import(pathToFileURL(path.join(skill, "editor/report-editor.mjs")).href);
  const editor = await startEditor({ file, port: 0, settings: {}, configFile: path.join(dir, "config.json"), backupDir: path.join(dir, "backup"), pollMs: 60_000, log: () => {} });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = watch(page);
    await page.goto(editor.url);
    await page.waitForFunction(() => document.getElementById("hre-host") && document.querySelector(".hr-deck-ui"));
    const before = await fs.readFile(file, "utf8");
    await page.click("#s3 h2");
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#s3 h2"));
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.keyboard.type(" today");
    await page.keyboard.press("Enter");
    for (let i = 0; i < 100 && !(await fs.readFile(file, "utf8")).includes("interface today"); i++) await page.waitForTimeout(50);
    const after = await fs.readFile(file, "utf8");
    assert.equal(after, before.replace("behind one interface</h2>", "behind one interface today</h2>"));
    await page.click("#s4 h2");
    await page.keyboard.press("p");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("hr-presenting")), false, "P while editing types instead of presenting");
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    pass("deck in the editor: slide titles and notes are editable and save in place");
    await page.close();
  } finally {
    await editor.close();
  }
};
