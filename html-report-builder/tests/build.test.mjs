import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseBrand } from "../scripts/lib/brand.mjs";
import { buildFile, buildSource, exportFile } from "../scripts/lib/build.mjs";
import { checkFile, checkSource } from "../scripts/lib/check.mjs";
import { main } from "../scripts/report.mjs";
import { ASSETS_DIR, SKILL_DIR, cssClasses, loadRuntime, minifyCss } from "../scripts/lib/runtime.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const minimal = (body = "") => `<!doctype html>
<html lang="en" data-template="findings">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test</title>
</head>
<body>
<header class="hero"><h1>Test report</h1></header>
<main>
<section id="summary"><h2>At a glance</h2><p>Verdict.</p></section>
<section id="findings"><h2>Findings &amp; evidence</h2>${body}</section>
</main>
</body>
</html>
`;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), "hr-build-"));

test("build adds one-line runtime blocks and a TOC, touching authored bytes only to declare the document", () => {
  const source = minimal("<p>Body.</p>");
  const { output, changed } = buildSource(source);
  assert.ok(changed);
  const lines = output.split("\n");
  const generated = lines.filter((l) => /data-hr-(runtime|generated)/.test(l));
  assert.equal(generated.length, 3);
  const declared = source.replace('data-template="findings">', 'data-template="findings" data-kernel-kind="report" data-kernel-contract="1">');
  assert.equal(lines.filter((l) => !/data-hr-(runtime|generated)/.test(l)).join("\n"), declared);
  assert.match(output, /<nav class="toc" data-hr-generated="toc" aria-label="Contents"><a href="#summary">At a glance<\/a><a href="#findings">Findings &amp; evidence<\/a><\/nav>/);
});

test("build is idempotent and refreshes the TOC after headings change", () => {
  const once = buildSource(minimal()).output;
  const twice = buildSource(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.output, once);
  const renamed = once.replace("<h2>At a glance</h2>", "<h2>Summary</h2>");
  const rebuilt = buildSource(renamed).output;
  assert.match(rebuilt, /<a href="#summary">Summary<\/a>/);
  assert.equal(rebuilt.split("data-hr-generated").length, 2);
});

const authored = (source) => source.split("\n").filter((l) => !/data-hr-(runtime|generated)/.test(l)).join("\n");

test("build declares Kernel's document contract on <html>: decks as decks, everything else as reports", () => {
  const report = buildSource(minimal()).output;
  assert.match(report, /<html lang="en" data-template="findings" data-kernel-kind="report" data-kernel-contract="1">/);
  const deck = buildSource(minimal().replace('data-template="findings"', 'data-template="slides"')).output;
  assert.match(deck, /<html lang="en" data-template="slides" data-kernel-kind="deck" data-kernel-contract="1">/);
  const untemplated = buildSource(minimal().replace(' data-template="findings"', "")).output;
  assert.match(untemplated, /<html lang="en" data-kernel-kind="report" data-kernel-contract="1">/);
  const switched = buildSource(report.replace('data-template="findings"', 'data-template="slides"')).output;
  assert.match(switched, /data-template="slides" data-kernel-kind="deck" data-kernel-contract="1">/, "a stale kind is corrected in place");
  assert.equal(buildSource(deck).changed, false);
});

test("build writes stable ids from headings into the source, de-duplicated, and keeps them across rebuilds and heading edits", () => {
  const body = `</section>
<section id="risks-2"><h2>Taken</h2></section>
<section><h2>Risks &amp; mitigations</h2><figure class="chart"><figcaption>Orders by store, 2026</figcaption></figure></section>
<section><h2>Risks &amp; mitigations</h2><figure><p>No caption.</p></figure></section>
<section><h2>Risks</h2></section>
<section><h2>Risks</h2></section>
<section><h2>2026 roadmap</h2></section>
<section><p>No heading.</p></section>
<section class="extra"><h2>Keeps</h2>`;
  const once = buildSource(minimal(body)).output;
  const ids = [...authored(once).matchAll(/<(?:section|figure)[^>]* id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["summary", "findings", "risks-2", "risks-mitigations", "orders-by-store-2026", "risks-mitigations-2", "figure-2", "risks", "risks-3", "section-2026-roadmap", "section-9", "keeps"]);
  assert.match(once, /<section class="extra" id="keeps">/, "a new id goes at the end of the open tag");
  assert.match(once, /<a href="#risks-mitigations">Risks &amp; mitigations<\/a>/, "the same build lists newly identified sections in the TOC");
  assert.equal(buildSource(once).changed, false, "the second build changes nothing");
  const renamed = buildSource(once.replace("<h2>Risks &amp; mitigations</h2><figure", "<h2>Open risks</h2><figure").replace("Orders by store, 2026", "Orders per store")).output;
  assert.match(renamed, /<section id="risks-mitigations"><h2>Open risks<\/h2><figure class="chart" id="orders-by-store-2026">/, "a heading edit does not move ids");
  assert.match(renamed, /<a href="#risks-mitigations">Open risks<\/a>/);
  assert.match(buildSource(minimal().replace('<section id="summary">', '<section id="">')).output, /<section id="at-a-glance">/, "an empty id counts as missing");
});

test("build marks slides, question cards, and their direct answer slots, leaving existing ids alone", () => {
  const deck = buildSource(`<!doctype html>
<html lang="en" data-template="slides">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Deck</title></head>
<body>
<main class="deck">
<section class="slide cover" id="s1"><h1>Move bookings safely</h1></section>
<aside class="notes"><p>Open.</p></aside>
<section class="slide"><h2>Retries fix most failed syncs</h2></section>
<section class="slide"><div class="tiles"></div></section>
<section class="slide" id="s4" data-kernel-slide><h2>Already marked</h2></section>
</main>
</body>
</html>
`).output;
  const slides = [...deck.matchAll(/<section class="slide[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(slides, [
    '<section class="slide cover" id="s1" data-kernel-slide>',
    '<section class="slide" id="retries-fix-most-failed-syncs" data-kernel-slide>',
    '<section class="slide" id="slide-3" data-kernel-slide>',
    '<section class="slide" id="s4" data-kernel-slide>'
  ]);
  assert.equal(buildSource(deck).changed, false);
  const report = buildSource(minimal(`<article class="question" id="q1"><h3>Retry for a day?</h3><p class="answer"></p><div><p class="answer"></p></div></article>
<article class="question"><h3>Should alerts page the on-call engineer at night?</h3><p class="answer" data-kernel-answer></p></article>
<section class="slide"><h2>A slide in a report is a section</h2></section>`)).output;
  assert.match(report, /<article class="question" id="q1" data-kernel-question><h3>Retry for a day\?<\/h3><p class="answer" data-kernel-answer><\/p><div><p class="answer"><\/p><\/div><\/article>/);
  assert.match(report, /<article class="question" id="should-alerts-page-the-on-call-engineer" data-kernel-question>/, "ids stop at a word within 40 characters");
  assert.match(report, /<section class="slide" id="a-slide-in-a-report-is-a-section">/, "only decks mark slides");
  assert.equal(buildSource(report).changed, false);
});

test("data-toc labels and data-toc=off are honored", () => {
  const labelled = buildSource(minimal().replace('<section id="summary">', '<section id="summary" data-toc="Short">')).output;
  assert.match(labelled, /<a href="#summary">Short<\/a>/);
  const off = buildSource(buildSource(minimal()).output.replace('data-template="findings"', 'data-template="findings" data-toc="off"')).output;
  assert.doesNotMatch(off, /data-hr-generated/);
});

test("local images are inlined with data-hr-src and re-inlined when the file changes", () => {
  const dir = tmp();
  mkdirSync(path.join(dir, "r.assets"));
  writeFileSync(path.join(dir, "r.assets", "shot.png"), PNG);
  const file = path.join(dir, "r.html");
  writeFileSync(file, minimal('<figure><img src="r.assets/shot.png" alt="Shot"></figure>'));
  buildFile(file);
  const built = readFileSync(file, "utf8");
  assert.match(built, /<img src="data:image\/png;base64,[^"]+" data-hr-src="r.assets\/shot.png" alt="Shot">/);
  assert.equal(buildFile(file).changed, false);
  writeFileSync(path.join(dir, "r.assets", "shot.png"), Buffer.concat([PNG, Buffer.from([0])]));
  assert.equal(buildFile(file).changed, true);
  assert.deepEqual(checkFile(file).errors, []);
});

test("export writes images as relative files and passes the export check", () => {
  const dir = tmp();
  mkdirSync(path.join(dir, "r.assets"));
  writeFileSync(path.join(dir, "r.assets", "shot.png"), PNG);
  const file = path.join(dir, "r.html");
  const inlineOnly = `<img src="data:image/png;base64,${PNG.toString("base64")}" alt="Pasted">`;
  writeFileSync(file, minimal(`<img src="r.assets/shot.png" alt="Shot">${inlineOnly}`));
  buildFile(file);
  const out = path.join(dir, "publish");
  const result = exportFile(file, out);
  const html = readFileSync(result.file, "utf8");
  assert.doesNotMatch(html, /data:image/);
  assert.doesNotMatch(html, /data-hr-src/);
  assert.match(html, /src="r.assets\/shot.png"/);
  assert.equal(result.assets.length, 1, "identical bytes are stored once");
  assert.ok(existsSync(path.join(out, "r.assets", "shot.png")));
  assert.deepEqual(checkFile(result.file, { mode: "export" }).errors, []);
  assert.ok(checkFile(result.file).errors.some((e) => /external/.test(e)), "a local check still requires inlined images");
});

test("runtime stays within budget and its script parses as one line", () => {
  const runtime = loadRuntime();
  assert.ok(runtime.css.length <= 21 * 1024, `css ${runtime.css.length} bytes`);
  assert.ok(runtime.js.length <= 3 * 1024, `js ${runtime.js.length} bytes`);
  assert.doesNotThrow(() => new Function(runtime.js));
  assert.doesNotMatch(runtime.js, /\n/);
  assert.equal(minifyCss('a { content: "x, y" ; }'), 'a{content:"x, y"}');
});

test("components.md snippets only use classes that report.css defines, and document them all", () => {
  const catalog = readFileSync(path.join(SKILL_DIR, "references/components.md"), "utf8");
  const snippets = [...catalog.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
  const css = loadRuntime().classes;
  const used = new Set([...snippets.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const unknown = [...used].filter((c) => !css.has(c) && !c.startsWith("mock-") && !c.startsWith("language-"));
  assert.deepEqual(unknown, []);
  const internalOnly = new Set(["hr-copy", "toc", "note"]);
  // highlight.js writes these token classes inside coloured code; authors never do.
  const generated = (c) => c.startsWith("hljs-") || /[a-z]_+$/.test(c);
  const undocumented = [...css].filter((c) => !used.has(c) && !internalOnly.has(c) && !generated(c) && !catalog.includes(`\`${c}\``) && !catalog.includes(`.${c}`));
  assert.deepEqual(undocumented, []);
});

test("templates build cleanly once guide comments are filled", () => {
  for (const name of ["plan", "findings", "brief", "slides"]) {
    const dir = tmp();
    const file = path.join(dir, `${name}.html`);
    const filled = readFileSync(path.join(ASSETS_DIR, "templates", `${name}.html`), "utf8").replace(/<!-- guide:[\s\S]*?-->/g, "<p>Content.</p>");
    writeFileSync(file, filled);
    buildFile(file);
    const result = checkFile(file);
    assert.deepEqual(result.errors, [], `${name}: ${result.errors.join("; ")}`);
    assert.deepEqual(result.warnings.filter((w) => /sections missing|vocabulary/.test(w)), [], name);
  }
});

test("cssClasses ignores numbers and strings", () => {
  assert.deepEqual([...cssClasses('.a{margin:.5rem} .b-c:hover{content:".nope"}')].sort(), ["a", "b-c"]);
});

const LOGO = `data:image/png;base64,${PNG.toString("base64")}`;
const DARK_LOGO = `data:image/png;base64,${Buffer.concat([PNG, Buffer.from([1])]).toString("base64")}`;
const STYLESHEET = '@font-face { font-family: "Inter"; src: url("data:font/woff2;base64,d09GMgABAAAAAA==") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }\n:root { --brand-accent: light-dark(#0a66ff, #66a3ff); --brand-on-accent: #ffffff; --brand-series-1: #ff0000; --brand-font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; }\n.hero h1 { letter-spacing: 0; }';
const kit = (overrides = {}) => ({
  id: "6f1c2a10-0000-4000-8000-000000000001", version: 3, stamp: "6f1c2a10-0000-4000-8000-000000000001@3", bundleFormat: 1,
  name: "Ozie", owner: { kind: "organization", id: "org-1", name: "Ozie Inc." },
  colors: { light: { accent: "#0a66ff", onAccent: "#ffffff", series: ["#ff0000"] }, dark: { accent: "#66a3ff" } },
  typography: { body: "Inter", heading: null, mono: null },
  logos: { light: LOGO, dark: null, alt: "Ozie" },
  stylesheet: STYLESHEET,
  ...overrides
});
const brandStyles = (source) => [...source.matchAll(/<style data-kernel-brand="([^"]*)">([\s\S]*?)<\/style>/g)].map((m) => ({ stamp: m[1], css: m[2] }));
const logoBlocks = (source) => source.match(/<div class="brand-logo" data-hr-generated="brand-logo">.*?<\/div>/g) || [];

test("--brand inlines the kit's stylesheet verbatim, stamped, right after the runtime style", () => {
  const output = buildSource(minimal(), { brand: parseBrand(kit()) }).output;
  assert.deepEqual(brandStyles(output), [{ stamp: "6f1c2a10-0000-4000-8000-000000000001@3", css: STYLESHEET }]);
  assert.match(output, /<style data-hr-runtime="[^"]+">[^\n]*<\/style>\n<style data-kernel-brand=/, "the kit's own CSS comes after the runtime");
  assert.deepEqual(checkSource(output).errors, []);
  assert.deepEqual(checkSource(output).warnings.filter((w) => !/template sections missing/.test(w)), []);
  const rebuilt = buildSource(buildSource(minimal()).output, { brand: parseBrand(kit()) }).output;
  assert.equal(rebuilt, output, "a report built before gets the same brand style");
});

test("a rebuild without --brand keeps the brand; the same stamp changes nothing and a new one replaces it", () => {
  const branded = buildSource(minimal(), { brand: parseBrand(kit()) }).output;
  assert.equal(buildSource(branded).changed, false, "no --brand keeps the brand style and logo");
  assert.equal(buildSource(branded, { brand: parseBrand(kit()) }).changed, false, "the same kit again changes nothing");
  const newer = buildSource(branded, { brand: parseBrand(kit({ version: 4, stamp: "6f1c2a10-0000-4000-8000-000000000001@4", stylesheet: ":root { --brand-accent: #123456; }" })) }).output;
  assert.deepEqual(brandStyles(newer), [{ stamp: "6f1c2a10-0000-4000-8000-000000000001@4", css: ":root { --brand-accent: #123456; }" }]);
  assert.equal(logoBlocks(newer).length, 1);
  assert.equal(buildSource(newer).changed, false);
});

test("--brand none removes the brand style and logo, back to the unbranded build", () => {
  const plain = buildSource(minimal()).output;
  const branded = buildSource(plain, { brand: parseBrand(kit()) }).output;
  const removed = buildSource(branded, { brand: null });
  assert.equal(removed.changed, true);
  assert.deepEqual(brandStyles(removed.output), []);
  assert.deepEqual(logoBlocks(removed.output), []);
  assert.doesNotMatch(removed.output, /data-kernel-brand|data-hr-generated="brand-logo"/);
  assert.equal(buildSource(plain, { brand: null }).changed, false, "removing no brand changes nothing");
});

test("the brand logo goes first in the hero or the deck's cover, light and dark when the kit has both", () => {
  const multiline = minimal().replace('<header class="hero"><h1>Test report</h1></header>', '<header class="hero">\n  <p class="eyebrow">Investigation</p>\n  <h1>Test report</h1>\n</header>');
  const report = buildSource(multiline, { brand: parseBrand(kit()) }).output;
  assert.match(report, /<header class="hero">\n<div class="brand-logo" data-hr-generated="brand-logo"><img src="data:image\/png;base64,[^"]+" alt="Ozie"><\/div>\n  <p class="eyebrow">/);
  assert.equal(buildSource(report, { brand: null }).output, buildSource(multiline).output, "removing the logo restores the hero");
  const both = buildSource(report, { brand: parseBrand(kit({ logos: { light: LOGO, dark: DARK_LOGO, alt: "" } })) }).output;
  assert.deepEqual(logoBlocks(both), [`<div class="brand-logo" data-hr-generated="brand-logo"><img class="brand-logo-light" src="${LOGO}" alt="Ozie"><img class="brand-logo-dark" src="${DARK_LOGO}" alt="Ozie"></div>`], "the kit's name is the alt text by default");
  assert.deepEqual(checkSource(both).warnings.filter((w) => /vocabulary/.test(w)), [], "the logo classes are in the vocabulary");
  const noLogo = buildSource(both, { brand: parseBrand(kit({ logos: { light: null, dark: null, alt: "" } })) }).output;
  assert.deepEqual(logoBlocks(noLogo), [], "a kit without a logo removes the old one");
  assert.equal(brandStyles(noLogo).length, 1);

  const deck = buildSource(`<!doctype html>
<html lang="en" data-template="slides">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Deck</title></head>
<body>
<main class="deck">
<section class="slide cover" id="s1">
<h1>Move bookings safely</h1>
</section>
<aside class="notes"><p>Open.</p></aside>
</main>
</body>
</html>
`, { brand: parseBrand(kit()) }).output;
  assert.match(deck, /<section class="slide cover" id="s1" data-kernel-slide>\n<div class="brand-logo" data-hr-generated="brand-logo"><img src="data:image\/png;base64,[^"]+" alt="Ozie"><\/div>\n<h1>/);
  assert.equal(buildSource(deck).changed, false);
  const { notes } = buildSource(minimal().replace(/<header class="hero">.*<\/header>\n/, ""), { brand: parseBrand(kit()) });
  assert.match(notes.join("\n"), /brand logo goes in the hero/);
});

test("brand kit files: the bundle or the task's wrapper, kit null means no brand, other bundle formats are refused", async (t) => {
  assert.equal(parseBrand({ source: "none", owner: null, kit: null }), null);
  assert.equal(parseBrand({ source: "project", owner: { kind: "project", id: "p" }, kit: kit() }).stamp, kit().stamp);
  // A response saved as is, in the API's envelope.
  assert.equal(parseBrand({ data: { source: "organization", owner: null, kit: kit() } }).stamp, kit().stamp);
  assert.equal(parseBrand({ data: { source: "none", owner: null, kit: null } }), null);
  assert.throws(() => parseBrand(kit({ bundleFormat: 2 })), /bundleFormat 2, but this builder reads bundleFormat 1/);
  assert.throws(() => parseBrand({ ...kit(), bundleFormat: undefined }), /no bundleFormat/);
  assert.throws(() => parseBrand(kit({ stylesheet: "a{}</style><script>" })), /contains "<\/"/);
  assert.throws(() => parseBrand(kit({ logos: { light: "https://x.test/logo.png", dark: null, alt: "" } })), /logos.light is not a base64 image data URI/);
  assert.throws(() => parseBrand(kit({ stamp: 'x" onload="y' })), /invalid stamp/);

  t.mock.method(console, "log", () => {});
  const errors = t.mock.method(console, "error", () => {});
  const dir = tmp();
  const file = path.join(dir, "r.html");
  writeFileSync(file, minimal());
  const save = (name, value) => { writeFileSync(path.join(dir, name), JSON.stringify(value)); return path.join(dir, name); };
  assert.equal(await main(["build", file, "--brand", save("kit.json", kit())]), 0);
  assert.equal(brandStyles(readFileSync(file, "utf8")).length, 1);
  assert.equal(await main(["build", file]), 0);
  assert.equal(brandStyles(readFileSync(file, "utf8")).length, 1, "a build without --brand keeps it");
  const before = readFileSync(file, "utf8");
  assert.equal(await main(["build", file, "--brand", save("future.json", kit({ bundleFormat: 2 }))]), 1);
  assert.match(errors.mock.calls.at(-1).arguments[0], /^ERROR: brand kit .*future\.json has bundleFormat 2/);
  assert.equal(readFileSync(file, "utf8"), before, "a refused kit leaves the report alone");
  assert.equal(await main(["build", file, "--brand"]), 2);
  assert.equal(await main(["build", file, "--brand", save("task.json", { source: "none", owner: null, kit: null })]), 0);
  assert.deepEqual(brandStyles(readFileSync(file, "utf8")), [], "a task without a kit builds without a brand");
  assert.equal(await main(["build", file, "--brand", save("kit.json", kit())]), 0);
  assert.equal(await main(["build", file, "--brand", "none"]), 0);
  assert.doesNotMatch(readFileSync(file, "utf8"), /data-kernel-brand|brand-logo"/);
});
