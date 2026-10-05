import assert from "node:assert/strict";
import { test } from "node:test";
import { indexBlocks, instrument, removal } from "../editor/blocks.mjs";
import { protect, restore, safeHref, sanitizeInline, validateRewrite, wordDiff } from "../editor/sanitize.mjs";
import { parse, splice } from "../scripts/lib/scan.mjs";

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
  assert.match(served, /<p data-hre="b2" data-hre-del>One/);
  assert.match(served, /<div data-hre="b4" data-hre-del class="tile">/);
  assert.match(served, /<p data-hre="b5" class="answer">/);
  assert.match(served, /<!--h--><\/head>/);
  assert.equal(served.replace(/ data-hre="[bc]\d+"(?: data-hre-del)?/g, "").replace("<!--h-->", "").replace("<!--b-->", ""), source);
  const headless = instrument("<!doctype html><p>Only a paragraph</p>", { headHtml: "<!--h-->", bodyHtml: "<!--b-->" });
  assert.ok(headless.startsWith("<!doctype html>"), "editor assets never precede the doctype");
  assert.ok(headless.endsWith("<!--h--><!--b-->"));
});

test("removal takes empty wrappers, a slide's notes, and the whole line, and unlinks references", () => {
  const source = `<main class="deck">
<section class="slide" id="s1"><h2>One</h2><p>See <a href="#s2">slide two</a>.</p></section>
<aside class="notes"><p>Notes one.</p></aside>
<section class="slide" id="s2"><h2>Two</h2>
  <div class="callout">
    <!-- a note -->
    <p>Only <b>child</b>.</p>
  </div>
  <p>Kept <a href="#s2">self link</a>.</p>
</section>
<aside class="notes"><p>Notes two.</p></aside>
</main>`;
  const doc = parse(source);
  const find = (predicate) => doc.elements.find(predicate);
  const only = find((e) => e.name === "p" && source.slice(e.innerStart, e.innerEnd).startsWith("Only"));
  const callout = removal(doc, only);
  assert.equal(callout.element.name, "div", "a wrapper left with only a comment goes too");
  assert.equal(splice(source, callout.edits), source.replace(/  <div class="callout">[\s\S]*?<\/div>\n/, ""));
  const slide = removal(doc, find((e) => e.name === "section" && e.attrs.some((a) => a.value === "s2")));
  assert.equal(slide.unlinked, 1, "links inside the deleted slide are not counted");
  assert.equal(splice(source, slide.edits), source
    .replace(/<section class="slide" id="s2">[\s\S]*Notes two\.<\/p><\/aside>\n/, "")
    .replace('<a href="#s2">slide two</a>', "slide two"));
  const inline = parse("<ul><li>a</li><li>b</li></ul>");
  assert.equal(splice(inline.source, removal(inline, inline.elements[1]).edits), "<ul><li>b</li></ul>");
});
