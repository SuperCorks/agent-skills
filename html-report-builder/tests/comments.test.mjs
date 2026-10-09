import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";
import { addThread, deleteThread, keepPins, publicThreads, readComments, replyToThread, setThreadStatus, stripComments } from "../scripts/lib/comments.mjs";
import { outlineData, formatOutline } from "../scripts/lib/outline.mjs";
import { attr, parse } from "../scripts/lib/scan.mjs";

const report = (audience = "internal") => buildSource(`<!doctype html>
<html lang="en" data-template="findings" data-audience="${audience}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comments</title>
</head>
<body>
<header class="hero"><h1>Comments</h1><p class="lede">The answer.</p></header>
<main>
<section id="summary"><h2>At a glance</h2><p id="claim">Sync fails 4% of nights.</p></section>
<section id="impact"><h2>Impact</h2><figure><div class="bars"><div style="--v:.4"><span>Checkout</span><b>40%</b></div></div><figcaption>Failures by page</figcaption></figure></section>
</main>
</body>
</html>
`).output;
const element = (source, test) => { const doc = parse(source); return { doc, element: doc.elements.find(test) }; };
const pin = (source, test, text, extra = {}) => {
  const { doc, element: target } = element(source, test);
  return addThread(source, doc, target, { x: 0.5, y: 0.25, text, by: "Simon", at: "2026-10-09T15:04Z", ...extra });
};

test("comments are stored after <main> and pinned to their element without touching other bytes", () => {
  const source = report();
  const first = pin(source, (e) => attr(e, "id") === "claim", "Is 4% per night or per week?", { kind: "block" });
  assert.equal(first.id, "cm1");
  assert.match(first.source, /<p data-hr-comment="cm1" id="claim">/);
  assert.match(first.source, /<\/main>\n<div data-hr-comments hidden>\n<article data-hr-thread="cm1" data-x="0\.5" data-y="0\.25" data-quote="Sync fails 4% of nights\.">\n<p data-by="Simon" data-at="2026-10-09T15:04Z">Is 4% per night or per week\?<\/p>\n<\/article>\n<\/div>\n/);
  const second = pin(first.source, (e) => e.name === "figure", "Use the same <scale> & order");
  assert.equal(second.id, "cm2");
  const threads = publicThreads(second.source);
  assert.deepEqual(threads.map((t) => [t.id, t.quote, t.pinned]), [["cm1", "Sync fails 4% of nights.", true], ["cm2", "Failures by page", true]]);
  assert.equal(threads[1].entries[0].text, "Use the same <scale> & order", "text round-trips through escaping");
  const stripped = stripComments(second.source);
  assert.equal(stripped, source, "stripping returns the original bytes");
});

test("replies, resolve, reopen, and delete edit the store in place", () => {
  let source = pin(report(), (e) => attr(e, "id") === "claim", "First").source;
  source = pin(source, (e) => e.name === "figure", "Second").source;
  source = replyToThread(source, "cm1", { text: "Per night.\nChecked the logs.", by: "Codex", at: "2026-10-09T16:00Z" });
  assert.deepEqual(readComments(source).threads[0].entries.map((e) => [e.by, e.text]), [["Simon", "First"], ["Codex", "Per night.\nChecked the logs."]]);
  source = setThreadStatus(source, "cm1", "resolved");
  assert.equal(readComments(source).threads[0].status, "resolved");
  source = setThreadStatus(source, "cm1", "open");
  assert.equal(readComments(source).threads[0].status, "open");
  source = deleteThread(source, "cm1");
  assert.doesNotMatch(source, /cm1/);
  source = deleteThread(source, "cm2");
  assert.doesNotMatch(source, /data-hr-comment/);
  assert.equal(source, report(), "deleting every thread removes the store too");
  assert.throws(() => replyToThread(source, "cm9", { text: "x", by: "a", at: "b" }), /no longer exists/);
  assert.throws(() => pin(report(), (e) => attr(e, "id") === "claim", "   "), /Write a comment first/);
});

test("AI rewrites keep pins: lost ones move to the rewritten element, invented ones are dropped", () => {
  const before = '<section data-hr-comment="cm2" id="a"><p data-hr-comment="cm1">One.</p><p>Two.</p></section>';
  assert.equal(keepPins(before, before), before);
  assert.equal(keepPins(before, '<section id="a"><p>One, rewritten.</p></section>'), '<section data-hr-comment="cm2 cm1" id="a"><p>One, rewritten.</p></section>');
  assert.equal(keepPins(before, '<section data-hr-comment="cm2" id="a"><p data-hr-comment="cm1 cm7">One.</p><p data-hr-comment="cm1">Two.</p></section>'),
    '<section data-hr-comment="cm2" id="a"><p data-hr-comment="cm1">One.</p><p>Two.</p></section>');
  assert.equal(keepPins("<p>Plain.</p>", "<p>Plain, rewritten.</p>"), "<p>Plain, rewritten.</p>");
});

test("outline lists open comments with where they are; check ignores their text but flags them in client reports", () => {
  let source = pin(report(), (e) => attr(e, "id") === "claim", "TODO: confirm with Codex logs").source;
  source = pin(source, (e) => e.name === "figure", "Resolved one").source;
  source = setThreadStatus(source, "cm2", "resolved");
  const outline = outlineData(source);
  assert.deepEqual(outline.comments.map((c) => [c.id, c.status, c.section]), [["cm1", "open", "summary"], ["cm2", "resolved", "impact"]]);
  const text = formatOutline(outline);
  assert.match(text, /Comments \(1 open, 1 resolved\)/);
  assert.match(text, /cm1 #summary L\d+ {2}on "Sync fails 4% of nights\."\n {6}Simon: TODO: confirm with Codex logs/);
  assert.doesNotMatch(checkSource(source).warnings.join("\n"), /TODO|comment/);

  const client = pin(report("client"), (e) => attr(e, "id") === "claim", "Ask Codex").source;
  const warnings = checkSource(client).warnings.join("\n");
  assert.match(warnings, /stores 1 review comment\(s\) \(1 open\)/);
  assert.doesNotMatch(warnings, /internal tools/, "comment text is not report text");
  assert.doesNotMatch(checkSource(client, { mode: "export" }).warnings.join("\n"), /review comment/);
});
