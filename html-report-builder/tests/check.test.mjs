import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";

const page = (body, { head = "", htmlAttrs = 'data-template="findings"' } = {}) => buildSource(`<!doctype html>
<html lang="en" ${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>T</title>
${head}</head>
<body>
<header class="hero"><h1>T</h1></header>
<main>
<section id="summary"><h2>S</h2></section><section id="findings"><h2>F</h2></section><section id="recommendation"><h2>R</h2></section><section id="next"><h2>N</h2></section>
${body}
</main>
</body>
</html>
`).output;
const errorsOf = (source, options) => checkSource(source, options).errors.join("\n");
const warningsOf = (source, options) => checkSource(source, options).warnings.join("\n");

test("a clean page passes with no errors or warnings", () => {
  const result = checkSource(page("<p>ok</p>"));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("document basics are required", () => {
  const broken = page("").replace("<!doctype html>", "").replace(' lang="en"', "").replace('<meta charset="utf-8">', "").replace(/<meta name="viewport"[^>]*>/, "").replace("<title>T</title>", "<title> </title>");
  const errors = errorsOf(broken);
  for (const expected of ["doctype", "lang", "charset", "viewport", "title"]) assert.match(errors, new RegExp(expected));
  assert.match(errorsOf(page("").replace(/<style data-hr-runtime[^\n]*\n/, "")), /run `report.mjs build/);
});

test("external assets, embeds, and network scripts are errors", () => {
  assert.match(errorsOf(page('<img src="https://x.test/a.png" alt="">')), /external/);
  assert.match(errorsOf(page('<img src="local.png" alt="">')), /inlined by `report.mjs build`/);
  assert.match(errorsOf(page("", { head: '<link rel="stylesheet" href="https://x.test/a.css">\n' })), /external/);
  assert.match(errorsOf(page("<iframe></iframe>")), /iframe/);
  assert.match(errorsOf(page("<script>fetch('/x')</script>")), /network/);
  assert.match(errorsOf(page("", { head: "<style>.mock-a{background:url(https://x.test/a.png)}</style>\n" })), /external URLs/);
  assert.match(errorsOf(page('<div style="background:url(a.png)"></div>')), /style url\(\)/);
});

test("ids must be unique and anchors must resolve", () => {
  assert.match(errorsOf(page('<p id="summary">dup</p>')), /duplicate ids: summary/);
  assert.match(errorsOf(page('<a href="#nowhere">x</a>')), /missing ids: #nowhere/);
});

test("vocabulary, template sections, and table wrapping are warnings", () => {
  assert.match(warningsOf(page('<div class="fancy-box">x</div>')), /fancy-box/);
  assert.doesNotMatch(warningsOf(page('<div class="device phone"><div class="whatever">x</div></div><p class="mock-x">y</p>')), /vocabulary/);
  assert.match(warningsOf(page("").replace('<section id="next"><h2>N</h2></section>', "")), /sections missing: #next/);
  assert.match(warningsOf(page("<table><tr><td>1</td></tr></table>")), /table-wrap/);
  assert.match(warningsOf(page("<section><h2>No id</h2></section>")), /without an id/);
});

test("question cards need ids in order, a full question, and a recommendation", () => {
  const good = '<article class="question" id="q1"><h3>Should we ship it?</h3><p class="rec">Yes.</p></article>';
  assert.deepEqual(checkSource(page(good)).warnings, []);
  assert.match(errorsOf(page('<article class="question"><h3>Ship?</h3></article>')), /without an id/);
  assert.match(warningsOf(page('<article class="question" id="q2"><h3>Hosting</h3></article>')), /q1, q2[\s\S]*not a full question[\s\S]*no \.rec/);
});

test("leftover guides and placeholders are errors; TODO in prose is a warning", () => {
  assert.match(errorsOf(page("<!-- guide: fill me -->")), /guide/);
  assert.match(errorsOf(page("<p>{{TITLE}}</p>")), /placeholder/);
  assert.match(warningsOf(page("<p>TODO: decide</p>")), /TODO/);
  assert.doesNotMatch(warningsOf(page("<pre><code>// TODO in code</code></pre>")), /TODO/);
});

test("client audience rejects internal notes and evidence pills", () => {
  const client = { htmlAttrs: 'data-template="findings" data-audience="client"' };
  assert.match(errorsOf(page('<div class="internal"><p>secret</p></div>', client)), /internal/);
  assert.match(errorsOf(page('<span class="pill observed">Observed</span>', client)), /evidence pills/);
  assert.equal(errorsOf(page('<span class="pill observed">Observed</span>')), "");
});

test("authored styles must be scoped to mock classes", () => {
  assert.equal(warningsOf(page("", { head: "<style>.mock-a{color:red}@media (max-width:600px){.mock-a b{color:blue}}</style>\n" })), "");
  assert.match(warningsOf(page("", { head: "<style>h2{color:red}</style>\n" })), /unscoped selectors: h2/);
});

test("options without a recommendation and broken relative links warn", () => {
  assert.match(warningsOf(page('<div class="options"><article class="option"><h3>A</h3></article></div>')), /without a \.recommended/);
  assert.match(warningsOf(page('<a href="missing-file.md">x</a>'), { file: "/tmp/hr-check-fixture/report.html" }), /do not exist/);
  assert.doesNotMatch(warningsOf(page('<a href="https://example.com/x">x</a>'), { file: "/tmp/hr-check-fixture/report.html" }), /do not exist/);
});

test("large inlined images warn", () => {
  const big = "A".repeat(420 * 1024);
  assert.match(warningsOf(page(`<img src="data:image/png;base64,${big}" alt="">`)), /over 300 KB/);
});
