import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";

const unbuilt = (body, { head = "", htmlAttrs = 'data-template="findings"' } = {}) => `<!doctype html>
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
`;
const page = (body, options) => buildSource(unbuilt(body, options)).output;
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

test("unknown vocabulary and templates, table wrapping, and missing ids are warnings", () => {
  assert.match(warningsOf(page('<div class="fancy-box">x</div>')), /fancy-box/);
  assert.doesNotMatch(warningsOf(page('<div class="device phone"><div class="whatever">x</div></div><p class="mock-x">y</p>')), /vocabulary/);
  assert.match(warningsOf(page("", { htmlAttrs: 'data-template="unknown"' })), /unknown data-template/);
  assert.match(warningsOf(page("<table><tr><td>1</td></tr></table>")), /table-wrap/);
  assert.match(warningsOf(unbuilt("<section><h2>No id</h2></section>")), /without an id[\s\S]*`report.mjs build` gives each one/);
  assert.doesNotMatch(warningsOf(page("<section><h2>No id</h2></section>")), /without an id/, "the build gives the section an id");
});

test("report templates accept concise topical outlines without invented decisions or next steps", () => {
  const outlines = {
    findings: '<section id="recovery"><h2>Guests can book again</h2><p>The corrected checkout accepts valid bookings.</p></section>',
    brief: '<section id="audience"><h2>The audience is ready to import</h2><p>Subscribed members with verified activity are included.</p></section>',
    plan: '<section id="verification"><h2>Prove retry recovery</h2><p>Repeat a failed write and check that it saves once.</p></section><section id="execution"><h2>Enable retries</h2><p>Add bounded retries for transient failures.</p></section>'
  };
  for (const [template, body] of Object.entries(outlines)) {
    const source = unbuilt("", { htmlAttrs: `data-template="${template}"` }).replace(/<main>[\s\S]*?<\/main>/, `<main>${body}</main>`);
    const result = checkSource(buildSource(source).output);
    assert.deepEqual(result.errors, [], template);
    assert.deepEqual(result.warnings, [], template);
  }
});

test("question cards need ids, numbered ones in order, a full question, a recommendation, and an answer slot", () => {
  const good = '<article class="question" id="q1"><h3>Should we ship it?</h3><p class="rec">Yes.</p><p class="answer"></p></article>';
  assert.deepEqual(checkSource(page(good)).warnings, []);
  assert.match(errorsOf(unbuilt('<article class="question"><h3>Ship?</h3></article>')), /without an id/);
  assert.equal(errorsOf(page('<article class="question"><h3>Ship?</h3></article>')), "", "the build gives the card an id");
  assert.match(warningsOf(page('<article class="question" id="q2"><h3>Hosting</h3></article>')), /q1, q2[\s\S]*keep its ids[\s\S]*not a full question[\s\S]*no \.rec[\s\S]*no <p class="answer"> as a direct child/);
  assert.doesNotMatch(warningsOf(page('<article class="question" id="retry-policy"><h3>Should we retry?</h3><p class="rec">Yes.</p><p class="answer"></p></article>')), /q1, q2/, "named ids need no number");
  assert.match(warningsOf(page('<article class="question" id="q1"><h3>Should we retry?</h3><p class="rec">Yes.</p><div><p class="answer"></p></div></article>')), /no <p class="answer"> as a direct child/);
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

test("a Kernel brand kit's style may style the whole page, but every URL and import check still applies to it", () => {
  const brand = (css) => `<style data-kernel-brand="6f1c2a10-0000-4000-8000-000000000001@3">${css}</style>\n`;
  const css = '@font-face { font-family: "Inter"; src: url("data:font/woff2;base64,d09GMgABAAAAAA==") format("woff2"); }\n:root { --brand-accent: light-dark(#0a66ff, #66a3ff); --brand-logo: url(data:image/png;base64,iVBORw0KGgo=); }\nh2 { letter-spacing: 0; }';
  const clean = checkSource(page("", { head: brand(css) }));
  assert.deepEqual(clean.errors, []);
  assert.deepEqual(clean.warnings, [], "no unscoped-selector warning for the brand style");
  assert.match(warningsOf(page("", { head: brand(css) + "<style>h2{color:red}</style>\n" })), /unscoped selectors: h2/, "authored styles still are checked");
  assert.match(errorsOf(page("", { head: brand(':root { --brand-logo: url("https://cdn.test/logo.png"); }') })), /CSS references external URLs: https:\/\/cdn.test\/logo.png/);
  assert.match(errorsOf(page("", { head: brand('@font-face { font-family: X; src: url(//fonts.test/x.woff2); }') })), /CSS references external URLs/);
  assert.match(errorsOf(page("", { head: brand('@import url("data:text/css,a{}");') })), /CSS contains @import/);
});
