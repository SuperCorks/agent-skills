import assert from "node:assert/strict";
import { test } from "node:test";
import { attr, decodeEntities, normalizeText, parse, splice, textContent, tokenize } from "../scripts/lib/scan.mjs";

const roundTrip = (source) => tokenize(source).map((t) => source.slice(t.start, t.end)).join("");

test("tokens cover the source exactly", () => {
  const samples = [
    "<!doctype html><html lang=en><head><title>a < b</title></head><body><p>x</p></body></html>",
    "<p class='a b' data-x=\"1>2\" hidden>text &amp; more</p><!-- c --><br/>",
    "<script>if (a < b && c > d) { document.write('</div>'); }</script><style>a>b{}</style>",
    "<p>unterminated <b", "<!--> <!---> <!-- open", "a < b and c<3", "</ >stray</p><?php ?>",
    "<textarea><b>not a tag</b></textarea><svg><path d='M0 0'/></svg>",
    "<img src=a.png alt=unquoted><a href=/x/y?z=1>link</a>"
  ];
  for (const sample of samples) assert.equal(roundTrip(sample), sample);
});

test("attributes record values and offsets", () => {
  const source = `<a href="#x" class='one two' data-v=3 disabled>t</a>`;
  const doc = parse(source);
  const link = doc.elements[0];
  assert.equal(attr(link, "href"), "#x");
  assert.equal(attr(link, "class"), "one two");
  assert.equal(attr(link, "data-v"), "3");
  assert.equal(attr(link, "disabled"), "");
  const href = link.attrs.find((a) => a.name === "href");
  assert.equal(source.slice(href.valueStart, href.valueEnd), "#x");
  assert.equal(attr(parse(`<p title="a &amp; b">`).elements[0], "title"), "a & b");
});

test("raw text elements do not produce tags", () => {
  const doc = parse("<script>var s = '<p>';</script><p>real</p>");
  assert.deepEqual(doc.elements.map((e) => e.name), ["script", "p"]);
  assert.equal(textContent(doc, doc.elements[1]), "real");
});

test("explicit closes are clean and implicit closes are not", () => {
  const doc = parse("<ul><li>a<li>b</li></ul><p>one<div>two</div></p><table><tr><td>1<td>2</td></tr></table><p>ok <b>x</b></p>");
  const byText = (text) => doc.elements.find((e) => (e.name === "li" || e.name === "td" || e.name === "p") && normalizeText(textContent(doc, e)) === text);
  assert.equal(byText("a").closeKind, "implicit");
  assert.equal(byText("a").clean, false);
  assert.equal(byText("b").closeKind, "explicit");
  assert.equal(byText("one").closeKind, "implicit");
  assert.equal(byText("1").closeKind, "implicit");
  assert.equal(byText("2").clean, true);
  assert.equal(byText("ok x").clean, true);
  assert.equal(doc.elements.find((e) => e.name === "ul").clean, false);
});

test("foreign self-closing elements are void, html self-closing is not", () => {
  const doc = parse("<svg><circle r=1 /></svg><div/>text</div>");
  assert.equal(doc.elements.find((e) => e.name === "circle").closeKind, "void");
  const div = doc.elements.find((e) => e.name === "div");
  assert.equal(textContent(doc, div), "text");
});

test("entities decode like the DOM for common cases", () => {
  assert.equal(decodeEntities("&lt;a&gt; &amp;&nbsp;&mdash;&#39;&#x2192;&unknown;"), "<a> & —'→&unknown;");
});

test("splice applies edits from the end and rejects overlaps", () => {
  assert.equal(splice("abcdef", [{ start: 1, end: 2, text: "B" }, { start: 4, end: 4, text: "+" }]), "aBcd+ef");
  assert.throws(() => splice("abcdef", [{ start: 1, end: 4, text: "" }, { start: 2, end: 3, text: "" }]));
});
