import assert from "node:assert/strict";
import { test } from "node:test";
import { indexBlocks, instrument } from "../editor/blocks.mjs";
import { protect, restore, safeHref, sanitizeInline, validateRewrite, wordDiff } from "../editor/sanitize.mjs";
import { parse } from "../scripts/lib/scan.mjs";

test("inline edits keep original inline tags and unwrap or drop everything else", () => {
  const original = 'Ship <strong>before Friday</strong> via <a href="#phases">phase 2</a>.';
  assert.equal(sanitizeInline('Ship <strong>before Monday</strong> via <a href="#phases">phase 2</a>.', original), 'Ship <strong>before Monday</strong> via <a href="#phases">phase 2</a>.');
  assert.equal(sanitizeInline("a<em>b</em>c", "plain"), "abc", "tags not in the original are unwrapped");
  assert.equal(sanitizeInline('x<script>alert(1)</script><img src=x onerror=alert(1)>y', "plain"), "xy");
  assert.equal(sanitizeInline('<strong onclick="alert(1)" class="hre-hover">t</strong>', "<strong>t</strong>"), "<strong>t</strong>");
  assert.equal(sanitizeInline('<a href="javascript:alert(1)">t</a>', '<a href="#x">t</a>'), "<a>t</a>");
  assert.equal(sanitizeInline("line<br>two &amp; 1 &lt; 2", "x"), "line<br>two &amp; 1 &lt; 2");
  assert.equal(sanitizeInline('<span data-hr-ui="">Copy</span>text', "<span>x</span>"), "text");
});

test("safeHref blocks script and data URLs, including obfuscated ones", () => {
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:x", "java\nscript:x", "data:text/html,x", "vbscript:x"]) assert.equal(safeHref(bad), false, bad);
  for (const good of ["#q1", "https://example.com", "mailto:a@b.c", "../plan.html"]) assert.equal(safeHref(good), true, good);
});

test("protect swaps opaque subtrees for placeholders and restore puts them back", () => {
  const outer = '<section id="s"><h2>T</h2><p>Text</p><pre><code>x &lt; y</code></pre><div class="device phone"><p>Mock</p></div><img src="data:image/png;base64,AAA" alt=""></section>';
  const { html, kept } = protect(outer);
  assert.equal(kept.size, 3);
  assert.match(html, /<hr-keep n="1"><\/hr-keep>.*<hr-keep n="2"><\/hr-keep>.*<hr-keep n="3"><\/hr-keep>/);
  assert.doesNotMatch(html, /base64|Mock|<pre>/);
  assert.equal(restore(html, kept), outer);
  assert.throws(() => restore(html.replace('<hr-keep n="2"></hr-keep>', ""), kept), /dropped protected content #2/);
  assert.throws(() => restore(html + '<hr-keep n="1"></hr-keep>', kept), /duplicated/);
  assert.throws(() => restore(html.replace('n="3"', 'n="9"'), kept), /invented/);
});

test("validateRewrite accepts a faithful rewrite and normalizes it", () => {
  const original = '<article class="question" id="q1"><h3>Ship?</h3><p class="rec">Yes.</p><hr-keep n="1"></hr-keep></article>';
  const candidate = '```html\n<article class="question" id="q1"><h3>Should we ship on Friday?</h3><p class=rec>Yes, <strong>Friday</strong>.</p><hr-keep n="1"></hr-keep></article>\n```';
  assert.equal(validateRewrite(candidate, original), '<article class="question" id="q1"><h3>Should we ship on Friday?</h3><p class="rec">Yes, <strong>Friday</strong>.</p><hr-keep n="1"></hr-keep></article>');
});

test("validateRewrite rejects unsafe or structurally different proposals", () => {
  const original = '<section id="risks"><h2>Risks</h2><p id="r1">One</p></section>';
  const cases = [
    ['<section id="risks"><h2>Risks</h2><p id="r1">One</p></section><p>extra</p>', /exactly one element/],
    ['<div id="risks"><h2>Risks</h2><p id="r1">One</p></div>', /changed <section> into <div>/],
    ['<section id="other"><h2>Risks</h2><p id="r1">One</p></section>', /changed the element's id/],
    ['<section id="risks"><h2>Risks</h2><p>One</p></section>', /removed id\(s\) r1/],
    ['<section id="risks"><h2>Risks</h2><p id="r1">One<script>alert(1)</script></p></section>', /disallowed element <script>/],
    ['<section id="risks"><h2 onclick="x()">Risks</h2><p id="r1">One</p></section>', /disallowed attribute onclick/],
    ['<section id="risks"><h2>Risks</h2><p id="r1" style="color:red">One</p></section>', /disallowed attribute style/],
    ['<section id="risks"><h2>Risks</h2><p id="r1"><a href="javascript:x()">One</a></p></section>', /disallowed attribute href/],
    ['<section id="risks"><h2>Risks</h2><p id="r1">One<img src=x></p></section>', /disallowed element <img>/],
    ['<section id="risks"><h2>Risks</h2><ul><li id="r1">One<li>Two</ul></section>', /unbalanced/]
  ];
  for (const [candidate, reason] of cases) assert.throws(() => validateRewrite(candidate, original), reason, candidate);
});

test("validateRewrite allows attributes and tags that were already in the original", () => {
  const original = '<div class="card" id="c"><p style="color:red">Legacy <font>styled</font></p></div>';
  assert.equal(validateRewrite('<div class="card" id="c"><p style="color:red">Legacy <font>styling</font> kept</p></div>', original), '<div class="card" id="c"><p style="color:red">Legacy <font>styling</font> kept</p></div>');
  assert.equal(validateRewrite('<div class="card" id="c"><div class="bars"><div style="--v:.4"><span>A</span><b>40%</b></div></div></div>', original).includes('style="--v:.4"'), true);
});

test("wordDiff marks insertions and deletions", () => {
  assert.deepEqual(wordDiff("the quick brown fox", "the slow brown fox jumps"), [
    { op: "=", text: "the" }, { op: "-", text: "quick" }, { op: "+", text: "slow" }, { op: "=", text: "brown fox" }, { op: "+", text: "jumps" }
  ]);
  assert.deepEqual(wordDiff("", "new"), [{ op: "+", text: "new" }]);
});

test("blocks index innermost phrasing elements and skip opaque or generated regions", () => {
  const source = `<html><head><title>T</title></head><body><nav data-hr-generated="toc"><a href="#a">A</a></nav><main><section id="a"><h2>A</h2><p>One <b>bold</b></p><ul><li>Item<ul><li>Child</li></ul></li></ul><pre>code</pre><div class="device"><p>Mock</p></div><div class="tile"><span>L</span><b>V</b></div><p class="answer"></p><p>Implicit<div>x</div></section></main></body></html>`;
  const doc = parse(source);
  const { blocks, scopes } = indexBlocks(doc);
  const text = (e) => source.slice(e.innerStart, e.innerEnd);
  assert.deepEqual(blocks.map((b) => text(b.element)), ["A", "One <b>bold</b>", "Child", "<span>L</span><b>V</b>", ""]);
  assert.ok(scopes.some((s) => s.element.name === "ul"), "clean containers are AI scopes");
  assert.ok(!scopes.some((s) => s.element.name === "section"), "a section holding an implicitly closed <p> is not");
  const served = instrument(source, { headHtml: "<!--h-->", bodyHtml: "<!--b-->" });
  assert.match(served, /<h2 data-hre="b1">A<\/h2>/);
  assert.match(served, /<!--h--><\/head>/);
  assert.equal(served.replace(/ data-hre="[bc]\d+"/g, "").replace("<!--h-->", "").replace("<!--b-->", ""), source);
  const headless = instrument("<!doctype html><p>Only a paragraph</p>", { headHtml: "<!--h-->", bodyHtml: "<!--b-->" });
  assert.ok(headless.startsWith("<!doctype html>"), "editor assets never precede the doctype");
  assert.ok(headless.endsWith("<!--h--><!--b-->"));
});
