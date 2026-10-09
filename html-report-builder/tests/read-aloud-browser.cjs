// Read aloud browser checks, run from tests/browser.cjs. Real editor, server, and word timings
// from the fake Speechify; a fake audio player whose clock the test advances, and a mock
// script writer that keeps the section's own wording.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const FAKE_PLAYER = () => {
  window.__hreReadAloudPlayer = (handlers) => {
    const state = { src: null, rate: 1, paused: true, time: 0, plays: [] };
    window.__fakeAudio = {
      state,
      advance: (seconds) => { state.time += seconds; },
      end: () => handlers.onEnded()
    };
    return {
      play(url, rate, at) { Object.assign(state, { src: url, rate, time: at, paused: false }); state.plays.push(url); },
      pause() { state.paused = true; },
      resume() { state.paused = false; },
      stop() { Object.assign(state, { src: null, paused: true, time: 0 }); },
      setRate(rate) { state.rate = rate; },
      currentTime: () => state.time,
      duration: () => null,
      unlock() {}
    };
  };
};

// Keeps the visible wording so highlights can be checked word by word.
const mockTranscript = (prompt) => prompt.split("<content>\n")[1].split("\n</content>")[0].split("\n")
  .filter((line) => line !== "Speaker notes:" && !line.startsWith("Columns:"))
  .map((line) => line.replace(/^#+\s*/, "").replace(/^- /, "").replace(/^\| (.*) \|$/, "$1.").replace(/ \| /g, ", ").replace(/^\[Chart: (.*)\]$/, "A chart showing $1."))
  .join("\n\n");

module.exports = async function readAloudTests({ browser, root, pass, watch }) {
  const skill = path.resolve(__dirname, "..");
  const load = (relative) => import(pathToFileURL(path.join(skill, relative)).href);
  const { startEditor } = await load("editor/report-editor.mjs");
  const { buildSource } = await load("scripts/lib/build.mjs");
  const { startFakeSpeechify } = await load("tests/fixtures/fake-speechify.mjs");
  process.env.HRE_NO_LOGIN_SHELL = "1";
  const fake = await startFakeSpeechify();
  const dir = path.join(root, "read-aloud");
  await fs.mkdir(dir, { recursive: true });
  const transcribed = [];
  const open = async (name, html, readAloud = {}) => {
    const file = path.join(dir, `${name}.html`);
    await fs.writeFile(file, buildSource(html).output);
    return startEditor({
      file, port: 0, settings: { provider: "codex", model: "gpt-6-luna", effort: "low" }, configFile: path.join(dir, "config.json"),
      backupDir: path.join(dir, `backup-${name}`), pollMs: 60_000, log: () => {},
      transcribe: async (settings, { prompt }) => {
        transcribed.push(prompt.match(/"([^"]*)" \(part/)[1]);
        await new Promise((resolve) => setTimeout(resolve, 250));
        return { transcript: mockTranscript(prompt), provider: "mock", model: settings.model, ms: 250 };
      },
      readAloud: { apiKey: "test-key", baseUrl: fake.url, ...readAloud }
    });
  };
  const page = async (editor, viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(FAKE_PLAYER);
    const tab = await context.newPage();
    const errors = watch(tab);
    tab.on("requestfailed", (request) => { if (request.url().includes("/api/read-aloud/")) errors.splice(errors.indexOf(`request failed ${request.url()}`), 1); });
    const prepares = [];
    tab.on("request", (request) => { if (request.url().endsWith("/api/read-aloud/prepare")) prepares.push(JSON.parse(request.postData())); });
    await tab.goto(editor.url);
    await tab.waitForFunction(() => document.getElementById("hre-read"));
    return { tab, errors, prepares, context };
  };
  const reader = (tab, id) => tab.locator(`#hre-host >> css=#${id}`);
  const highlighted = (tab) => tab.evaluate(() => {
    const highlight = CSS.highlights.get("hre-read-aloud");
    return highlight ? [...highlight].map((range) => range.toString()).join(" ") : null;
  });
  const time = (tab, seconds) => tab.evaluate((s) => window.__fakeAudio.advance(s), seconds);
  const until = async (check, message, timeout = 5000) => {
    const started = Date.now();
    while (!(await check())) {
      if (Date.now() - started > timeout) throw new Error(`timed out: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const waitHighlight = (tab, word) => tab.waitForFunction((w) => {
    const highlight = CSS.highlights.get("hre-read-aloud");
    return highlight && [...highlight].some((range) => range.toString() === w);
  }, word);

  const report = await open("report", `<!doctype html>
<html lang="en" data-template="findings">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Listening test</title></head>
<body>
<header class="hero"><p class="eyebrow">Findings</p><h1>Listening test</h1><p class="lede">The answer comes first.</p></header>
<main>
<section id="summary"><h2>At a glance</h2><p>Checkout loses most buyers at the payment step on Safari.</p></section>
<section id="data"><h2>Where buyers drop</h2><div class="table-wrap"><table><thead><tr><th>Step</th><th>Sessions</th></tr></thead><tbody><tr><td>Started checkout</td><td>48,200</td></tr><tr><td>Reached payment</td><td>16,300</td></tr></tbody></table></div></section>
<section id="next"><h2>Next steps</h2><p>Ship the hotfix and measure paid orders every morning.</p></section>
</main>
</body>
</html>
`);
  try {
    const { tab, errors, prepares, context } = await page(report);
    await tab.hover("#summary h2");
    const button = tab.locator('#hre-read >> css=.ra-sec[data-key="summary"]');
    await button.waitFor({ state: "visible" });
    const placed = await button.boundingBox();
    const heading = await tab.locator("#summary h2").boundingBox();
    assert.ok(placed.x + placed.width <= heading.x && Math.abs(placed.y + placed.height / 2 - (heading.y + heading.height / 2)) < 12, "the play button sits in the gutter beside the heading");
    await button.click();
    await tab.waitForFunction(() => document.getElementById("hre-host").shadowRoot.getElementById("ra-status").textContent.startsWith("Writing the spoken script"));
    await tab.waitForFunction(() => window.__fakeAudio.state.src);
    assert.match(await tab.evaluate(() => window.__fakeAudio.state.src), /^\/api\/read-aloud\/audio\/[a-f0-9]{32}\.mp3$/);
    assert.ok(await tab.evaluate(() => document.getElementById("summary").classList.contains("hre-reading")), "the section being read is outlined");
    assert.match(await reader(tab, "ra-label").textContent(), /^At a glance · 2 \/ 4$/);
    await tab.waitForFunction(() => document.getElementById("hre-host").shadowRoot.getElementById("ra-status").textContent.startsWith("Speechify · Harper · script by gpt-6-luna"));
    // Transcript: "At a glance" then the paragraph; the fake voices 0.4 s per word.
    await time(tab, 0.4 * 5 + 0.05);
    await waitHighlight(tab, "most");
    const words = await highlighted(tab);
    assert.equal(words, "loses most buyers at", "a four-word window around the spoken word");
    await tab.screenshot({ path: path.join(root, "read-aloud-report.png") });
    await until(() => prepares.some((p) => p.key === "data" && p.synthesize === false), "the next section's script is prefetched without audio");
    await until(() => prepares.some((p) => p.key === "data" && p.synthesize !== false), "its audio is requested near the end");
    pass("read aloud: a section's play button starts reading, outlines the section, highlights a four-word window, and prefetches the next section");

    const before = transcribed.filter((label) => label === "Where buyers drop").length;
    await tab.evaluate(() => window.__fakeAudio.end());
    await tab.waitForFunction(() => document.getElementById("data").classList.contains("hre-reading"));
    await tab.waitForFunction(() => window.__fakeAudio.state.src && !document.getElementById("summary").classList.contains("hre-reading"));
    assert.equal(transcribed.filter((label) => label === "Where buyers drop").length, before, "the next section reuses its prefetched script");
    // "Where buyers drop" (3 words) then "Started checkout, 48,200." as one row sentence.
    await time(tab, 0.4 * 3 + 0.05);
    await tab.waitForFunction(() => document.querySelector("[data-hre-reading-row]"));
    assert.equal(await tab.evaluate(() => document.querySelector("[data-hre-reading-row]").textContent), "Started checkout48,200");
    assert.equal(await highlighted(tab), "Started checkout 48,200", "a table row is highlighted whole");
    pass("read aloud: the end of a section moves to the next one, and a table row is highlighted as a whole");

    await reader(tab, "ra-rate").click();
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.rate), 1.1);
    await tab.keyboard.press("r");
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.paused), true, "R pauses");
    await tab.keyboard.press("r");
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.paused), false, "R resumes");
    await tab.keyboard.press("]");
    await tab.waitForFunction(() => document.getElementById("next").classList.contains("hre-reading"));
    await tab.waitForFunction(() => /\/audio\//.test(window.__fakeAudio.state.src || ""));
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.rate), 1.1, "the speed carries over");
    await tab.keyboard.press("[");
    await tab.waitForFunction(() => document.getElementById("data").classList.contains("hre-reading"));
    await tab.waitForFunction(() => /\/audio\//.test(window.__fakeAudio.state.src || ""));
    await tab.click("#summary p");
    await tab.waitForFunction(() => document.getElementById("hre-host").shadowRoot.getElementById("ra-status").textContent === "Paused while you edit");
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.paused), true);
    await tab.keyboard.press("Escape");
    await reader(tab, "ra-stop").click();
    assert.equal(await tab.evaluate(() => document.querySelectorAll(".hre-reading").length), 0);
    assert.equal(await tab.evaluate(() => CSS.highlights.has("hre-read-aloud")), false, "stop clears the highlight");
    assert.equal(await reader(tab, "reader").isHidden(), true);
    assert.deepEqual(errors, []);
    pass("read aloud: speed carries over, R pauses and resumes, [ and ] skip, editing pauses, and stop clears everything");
    await context.close();
  } finally {
    await report.close();
  }

  const deck = await open("deck", `<!doctype html>
<html lang="en" data-template="slides" data-audience="internal">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Deck listening test</title></head>
<body>
<main class="deck">
<section class="slide cover" id="s1" data-toc="Cover"><p class="eyebrow">Red Krypton</p><h1>Recover lost sales</h1></section>
<aside class="notes"><p>Open with the decision we need today.</p></aside>
<section class="slide" id="s2" data-toc="Why"><p class="eyebrow">Why now</p><h2>Most shoppers never pay at checkout</h2><p>Payment fails on Safari.</p></section>
<aside class="notes"><p>The numbers come from Shopify.</p></aside>
</main>
</body>
</html>
`);
  try {
    const { tab, errors, context } = await page(deck);
    await tab.hover("#s1");
    const button = tab.locator('#hre-read >> css=.ra-sec[data-key="s1"]');
    await button.waitFor({ state: "visible" });
    const placed = await button.boundingBox();
    const slide = await tab.locator("#s1").boundingBox();
    assert.ok(placed.x + placed.width <= slide.x + 2 && placed.y >= slide.y - 2 && placed.y < slide.y + 40, `the button sits beside the zoomed slide's top (${JSON.stringify(placed)} vs ${JSON.stringify(slide)})`);
    await button.click();
    await tab.waitForFunction(() => window.__fakeAudio.state.src);
    assert.ok(await tab.evaluate(() => document.getElementById("s1").classList.contains("hre-reading") && document.querySelector("#s1 + aside.notes").classList.contains("hre-reading")), "the slide and its notes are one unit");
    // "Red Krypton Recover lost sales" (5 words), then the notes.
    await time(tab, 0.4 * 7 + 0.05);
    await tab.waitForFunction(() => {
      const highlight = CSS.highlights.get("hre-read-aloud");
      return highlight && [...highlight].some((range) => range.startContainer.parentElement.closest("aside.notes"));
    });
    assert.match(await highlighted(tab), /decision|need|today|with|the/);
    await tab.screenshot({ path: path.join(root, "read-aloud-deck.png") });
    await tab.keyboard.press("p");
    await tab.waitForFunction(() => document.documentElement.classList.contains("hr-presenting"));
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.paused), true, "presenting pauses reading");
    await tab.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    pass("read aloud on a deck: the slide and its notes are read as one unit, the button sits beside the zoomed slide, and presenting pauses it");
    await context.close();
  } finally {
    await deck.close();
  }

  fake.mode = 401;
  const broken = await open("broken", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Broken key</title></head>
<body><main><section id="one"><h2>One</h2><p>Some text to read.</p></section></main></body></html>
`);
  try {
    const { tab, errors, context } = await page(broken);
    await tab.keyboard.press("r");
    await tab.waitForFunction(() => /rejected/.test(document.getElementById("hre-host").shadowRoot.getElementById("ra-status").textContent));
    assert.equal(await reader(tab, "ra-action").textContent(), "Check again");
    assert.equal(await tab.evaluate(() => window.__fakeAudio.state.plays.length), 0, "nothing plays");
    assert.equal(await tab.evaluate(() => document.getElementById("hre-host").shadowRoot.getElementById("listen").classList.contains("warn")), true);
    fake.mode = 200;
    await reader(tab, "ra-action").click();
    await tab.waitForFunction(() => !document.getElementById("hre-host").shadowRoot.getElementById("listen").classList.contains("warn"));
    await tab.keyboard.press("r");
    await tab.waitForFunction(() => window.__fakeAudio.state.plays.length === 1);
    assert.deepEqual(errors, []);
    pass("read aloud: a rejected Speechify key says why and plays nothing; Check again recovers");
    await context.close();
  } finally {
    fake.mode = 200;
    await broken.close();
    await fake.close();
  }
};
