import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildFile, buildSource, exportFile } from "../scripts/lib/build.mjs";
import { checkFile } from "../scripts/lib/check.mjs";
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

test("build adds one-line runtime blocks and a TOC without touching authored bytes", () => {
  const source = minimal("<p>Body.</p>");
  const { output, changed } = buildSource(source);
  assert.ok(changed);
  const lines = output.split("\n");
  const generated = lines.filter((l) => /data-hr-(runtime|generated)/.test(l));
  assert.equal(generated.length, 3);
  assert.equal(lines.filter((l) => !/data-hr-(runtime|generated)/.test(l)).join("\n"), source);
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
  assert.ok(runtime.css.length <= 15 * 1024, `css ${runtime.css.length} bytes`);
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
  const unknown = [...used].filter((c) => !css.has(c) && !c.startsWith("mock-"));
  assert.deepEqual(unknown, []);
  const internalOnly = new Set(["hr-copy", "toc", "note"]);
  const undocumented = [...css].filter((c) => !used.has(c) && !internalOnly.has(c) && !catalog.includes(`\`${c}\``) && !catalog.includes(`.${c}`));
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
