// Google Docs delivery: report -> blocks -> requests, applied to an in-memory Doc that follows
// the API's index rules (tests/fixtures/fake-docs.mjs), then read back and edited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeGallery } from "./gallery.mjs";
import { FakeDoc } from "./fixtures/fake-docs.mjs";
import { ANSWER_PLACEHOLDER, convertReport, makePalette, normalizeRuns, runsText } from "../scripts/lib/gdoc-blocks.mjs";
import { emitBlocks, fontFamily } from "../scripts/lib/gdoc-emit.mjs";
import { docIdFrom, formatOutline, readDocument } from "../scripts/lib/gdoc-read.mjs";
import { EditError, planEdits, prepareOps } from "../scripts/lib/gdoc-edit.mjs";
import { printableSource } from "../scripts/lib/pdf.mjs";
import { imageSize } from "../scripts/lib/image-host.mjs";

const palette = makePalette();
const galleryDir = mkdtempSync(path.join(os.tmpdir(), "gdoc-test-"));
const gallery = printableSource(readFileSync(writeGallery(galleryDir), "utf8")).source;

function convert(source, options = {}) {
  let n = 0;
  return convertReport(source, { palette, shotId: () => `shot${++n}`, imageBytes: () => ({ bytes: Buffer.from("png"), mime: "image/png" }), ...options });
}

const fakeImages = (converted) => new Map([...converted.shots.map((s) => s.key), ...converted.images.keys()].map((key) => [key, { uri: `https://example.com/${key}.png`, width: 200 }]));

/** Write converted blocks into a fresh fake Doc the way `gdoc create` does. */
function render(source, options) {
  const converted = convert(source, options);
  const doc = new FakeDoc({ id: "1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: converted.title });
  const emitted = emitBlocks(converted.blocks, { cursor: 1, images: fakeImages(converted), palette });
  doc.batchUpdate({ requests: [...emitted.requests, ...emitted.ranges.map((r) => ({ createNamedRange: { name: r.name, range: { startIndex: r.start, endIndex: r.end } } }))] });
  return { doc, converted, emitted, model: () => readDocument(doc.get({ commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED" })) };
}

const report = (body, { audience = "internal", template = "brief" } = {}) => `<!doctype html><html lang="en" data-template="${template}" data-audience="${audience}"><head><title>T</title></head><body>
<header class="hero"><p class="eyebrow">Brief</p><h1>Delivery plan</h1><p class="lede">One line.</p></header>
<main>${body}</main></body></html>`;

const fragment = (html) => `<!doctype html><html lang="en" data-template="brief" data-audience="client"><head><title>F</title></head><body><main>${html}</main></body></html>`;

const rangeText = (doc, model, name) => doc.textBetween(model.ranges[name].start, model.ranges[name].end);

/** Apply an edit the way `gdoc edit` sends it: content (maybe as suggestions), then the direct batch. */
function applyEdit(doc, ops, { suggest = false } = {}) {
  const model = readDocument(doc.get({ commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED" }));
  const prepared = prepareOps(model, ops, { convert: (html) => convertReport(fragment(html), { fragment: true, palette }) });
  const plan = planEdits(model, prepared.prepared, { suggest, palette, images: new Map() });
  if (suggest) {
    if (plan.content.length) doc.batchUpdate({ requests: plan.content, writeControl: { writeMode: "SUGGEST", targetRevisionId: model.revisionId } });
    if (plan.after.length) doc.batchUpdate({ requests: plan.after });
  } else doc.batchUpdate({ requests: [...plan.content, ...plan.after], writeControl: { targetRevisionId: model.revisionId } });
  return { plan, prepared, model: readDocument(doc.get({ commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED" })) };
}

test("labels the report draws with CSS become text", () => {
  const { blocks } = convert(gallery);
  const texts = blocks.flatMap(function flat(b) { return b.type === "p" ? [runsText(b.runs)] : b.type === "table" ? b.rows.flat().flatMap((c) => c.blocks.flatMap(flat)) : []; });
  const has = (pattern) => assert.ok(texts.some((t) => pattern.test(t)), `missing ${pattern}`);
  has(/^Q1\. Should failed syncs retry/);
  has(/^F1\. Rate limiting/);
  has(/^Recommendation: Yes: retry/);
  has(/^Owner: Client operations lead/);
  has(/^Details: Phase 2 · Alert fatigue risk/);
  has(/^Exit: nightly runs green/);
  has(/^Before$/);
  has(/^After$/);
  has(/Job queue\s+Recommended$/);
  has(/^✓ Yes$/);
  has(/^◐ Until the next update$/);
  has(/^✕ No$/);
  has(/^☑ Queue worker deployed/);
  has(/^Storefront \(checkout event\) → API → Queue → Sync worker$/);
  assert.ok(blocks.some((b) => b.type === "table" && b.answerOf === "q1"));
});

test("visual-only components are drawn, not dropped", () => {
  const { shots, blocks } = convert(gallery);
  assert.ok(shots.length >= 6, `expected chart, bars, roadmap, devices, pins, shots; got ${shots.length}`);
  assert.equal(blocks.filter((b) => b.type === "image").length, shots.length + 1, "the figure's screenshot is an image file");
});

test("client reports leave out internal notes and evidence pills; decks are refused", () => {
  const source = report(`<section id="s1"><h2>One</h2><p><span class="pill observed">Observed</span> Fact.</p><div class="internal"><p>Secret.</p></div></section>`, { audience: "client" });
  const { blocks, notes } = convert(source);
  const text = blocks.filter((b) => b.type === "p").map((b) => runsText(b.runs)).join("\n");
  assert.ok(!text.includes("Secret") && !text.includes("Observed"));
  assert.ok(notes.some((n) => n.includes(".internal")));
  assert.throws(() => convert(report("<section class=\"slide\"></section>", { template: "slides" })), /decks are not converted/);
});

test("whitespace collapses like a browser and line breaks survive", () => {
  assert.equal(runsText(normalizeRuns([{ text: "  a \n b " }, { text: " c" }])), "a b c");
  assert.equal(runsText(normalizeRuns([{ text: "a" }, { text: "\u000b" }, { text: " b" }])), "a\u000bb");
  assert.equal(runsText(normalizeRuns([{ text: "x\n  y\n" }], { pre: true })), "x\u000b  y\u000b");
});

test("the gallery writes into a Doc with valid indices and ranges on every block", () => {
  const { doc, model: read } = render(gallery);
  const model = read();
  assert.ok(rangeText(doc, model, "k_q1").startsWith("Q1. Should failed syncs retry"));
  assert.equal(rangeText(doc, model, "k_q1_answer"), ANSWER_PLACEHOLDER);
  assert.ok(rangeText(doc, model, "k_f1").startsWith("F1. Rate limiting"));
  for (const s of model.sections.filter((x) => x.id.startsWith("c-"))) assert.ok(model.paragraphs.find((p) => p.handle === s.first).style === "HEADING_1", `${s.id} starts at its heading`);
  assert.deepEqual(model.answers, { q1: "" });
  // Steps keep one list across their bodies; the bodies have no bullet.
  const steps = model.paragraphs.filter((p) => /Phase [12]: /.test(p.runs.map((r) => r.content).join("")));
  assert.equal(steps.length, 2);
  assert.equal(steps[0].bullet.listId, steps[1].bullet.listId);
  const body = model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("Move the job")));
  assert.equal(body.bullet, null);
  // Nothing but the required separators: an empty paragraph only between two tables.
  const top = [...model.paragraphs.filter((p) => p.top), ...model.tables.filter((t) => t.top)].sort((a, b) => a.start - b.start);
  top.forEach((el, i) => {
    if (!el.runs || el.runs.map((r) => r.content).join("") !== "\n" || i === top.length - 1) return;
    assert.ok(top[i - 1]?.rows || top[i + 1]?.rows, `stray empty paragraph ${el.handle}`);
  });
});

test("nested lists keep their levels (tabs are consumed by the bullets)", () => {
  const { doc, model } = render(report(`<section id="s1"><h2>Lists</h2><ul><li>One<ul><li>Two<ol><li>Three</li></ol></li></ul></li><li>Four</li></ul><p>After.</p></section>`));
  const m = model();
  const levels = m.paragraphs.filter((p) => p.bullet).map((p) => [p.runs.map((r) => r.content).join("").trim(), p.bullet.level]);
  assert.deepEqual(levels, [["One", 0], ["Two", 1], ["Three", 2], ["Four", 0]]);
  assert.ok(!doc.text().includes("\t"));
  assert.equal(rangeText(doc, m, "k_s1").trim().split("\n").at(-1), "After.");
});

test("a table after a list item is not attached to it (it would take the indent)", () => {
  const { model } = render(report(`<section id="s1"><h2>L</h2><ul><li>Item</li></ul><div class="table-wrap"><table><tr><td>a</td></tr></table></div></section>`));
  const m = model();
  const table = m.tables[0];
  const before = m.paragraphs.filter((p) => p.top && p.end <= table.start).at(-1);
  assert.equal(before.runs.map((r) => r.content).join(""), "\n");
  assert.equal(before.bullet, null);
  assert.equal(before.style, "NORMAL_TEXT");
});

test("the outline places comments and suggestions in their sections", () => {
  const { doc, model } = render(gallery);
  let m = model();
  const p = m.paragraphs.find((x) => x.runs.some((r) => r.content.startsWith("Retries hide short")));
  doc.clientComment({ startIndex: p.start, endIndex: p.start + 7 }, "Why 24 hours?");
  const target = m.paragraphs.find((x) => x.runs.some((r) => r.content.includes("Linked from a snippet")) && x.section === "risks");
  doc.clientSuggest([{ insertText: { location: { index: target.end - 1 }, text: " Indeed." } }]);
  m = model();
  assert.equal(m.comments[0].section, "q1");
  assert.equal(m.comments[0].quote, "Retries");
  assert.equal(m.suggestions[0].section, "risks");
  assert.equal(m.suggestions[0].author, "Raine");
  const text = formatOutline(m);
  assert.match(text, /c1 \[q1 · p\d+\] Raine: "Why 24 hours\?" on "Retries"/);
  assert.match(text, /g1 \[risks · p\d+\] Raine: Add: “ Indeed\.”/);
  assert.match(formatOutline(m, { section: "q1" }), /Q1\. Should failed syncs/);
});

test("replace-text keeps the replaced text's style, directly or as a suggestion", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Plain <strong>bold words</strong> after.</p></section>`));
  applyEdit(doc, [{ op: "replace-text", in: "s1", find: "bold words", replace: "strong text" }]);
  const run = doc.get().tabs[0].documentTab.body.content.flatMap((e) => e.paragraph?.elements || []).find((e) => e.textRun?.content.includes("strong text"));
  assert.equal(run.textRun.content, "strong text");
  assert.equal(run.textRun.textStyle.bold, true);
  const { model } = applyEdit(doc, [{ op: "replace-text", in: "s1", find: "after", replace: "afterwards" }], { suggest: true });
  assert.equal(model.suggestions.length, 1);
  assert.match(model.suggestions[0].summary, /Replace: “after” with “afterwards”/);
  applyEdit(doc, [{ op: "accept", suggestion: "g1" }]);
  assert.match(doc.text(), /strong text afterwards\./);
});

test("replace-text refuses missing and ambiguous matches", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>same same</p></section>`));
  assert.throws(() => applyEdit(doc, [{ op: "replace-text", find: "nothere", replace: "x" }]), EditError);
  assert.throws(() => applyEdit(doc, [{ op: "replace-text", find: "same", replace: "x" }]), /appears 2 times/);
  applyEdit(doc, [{ op: "replace-text", find: "same", replace: "x", all: true }]);
  assert.match(doc.text(), /x x\n/);
});

test("inserting after a section's last block keeps it in the section; a new section gets its own range", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>First.</p></section><section id="s2"><h2>Two</h2><p>Second.</p></section>`));
  let { model } = applyEdit(doc, [{ op: "insert", after: "s1", html: "<p>Added to one.</p>" }]);
  assert.match(rangeText(doc, model, "k_s1"), /First\.\nAdded to one\.\n$/);
  assert.match(rangeText(doc, model, "k_s2"), /^Two\nSecond\./);
  ({ model } = applyEdit(doc, [{ op: "insert", after: "s1", html: `<section id="s15"><h2>One and a half</h2><div class="callout warn"><p>Careful.</p></div></section>` }]));
  assert.match(rangeText(doc, model, "k_s15"), /^One and a half\nCareful\.\n$/);
  assert.doesNotMatch(rangeText(doc, model, "k_s1"), /One and a half/);
  const heading = model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("One and a half")));
  assert.equal(heading.style, "HEADING_1");
});

test("insert adds tables and question cards with an answer range", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>First.</p></section>`));
  const { model } = applyEdit(doc, [{ op: "insert", after: "s1", html: `<article class="question" id="q4"><h3>Ship it?</h3><p class="rec">Yes.</p><p class="answer"></p></article><div class="table-wrap"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td class="ok">2</td></tr></tbody></table></div>` }]);
  assert.match(rangeText(doc, model, "k_q4"), /^Q4\. Ship it\?\nRecommendation: Yes\.\nAnswer\n/);
  assert.equal(rangeText(doc, model, "k_q4_answer"), ANSWER_PLACEHOLDER);
  assert.equal(model.tables.length, 2);
  assert.match(doc.text(), /\|A\n\|B\n\]?.*\|1\n\|✓ 2\n\]/s);
});

test("set-answer writes the answer; the outline reads it back", () => {
  const { doc } = render(report(`<section id="s1"><h2>Q</h2><article class="question" id="q1"><h3>Go?</h3><p class="answer"></p></article></section>`));
  let { model } = applyEdit(doc, [{ op: "set-answer", q: "q1", text: "Yes, go." }]);
  assert.deepEqual(model.answers, { q1: "Yes, go." });
  const run = doc.get().tabs[0].documentTab.body.content.find((e) => e.table).table.tableRows[0].tableCells[0].content[0].paragraph.elements[0].textRun;
  assert.equal(run.textStyle.italic, undefined, "the placeholder's italics are gone");
  ({ model } = applyEdit(doc, [{ op: "set-answer", q: "q1", text: "No." }], { suggest: true }));
  assert.equal(model.suggestions.length, 1);
  applyEdit(doc, [{ op: "accept", suggestion: "g1" }]);
  assert.deepEqual(readDocument(doc.get()).answers, { q1: "No." });
});

test("set-paragraph and delete", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Old text.</p><p>Gone soon.</p></section><section id="s2"><h2>Two</h2><p>Stays.</p></section>`));
  let model = readDocument(doc.get());
  const old = model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("Old text")));
  ({ model } = applyEdit(doc, [{ op: "set-paragraph", p: old.handle, html: "New <b>bold</b> text." }]));
  assert.match(doc.text(), /New bold text\.\n/);
  const bold = doc.get().tabs[0].documentTab.body.content.flatMap((e) => e.paragraph?.elements || []).find((e) => e.textRun?.content === "bold");
  assert.equal(bold.textRun.textStyle.bold, true);
  const gone = model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("Gone soon")));
  applyEdit(doc, [{ op: "delete", from: gone.handle }]);
  assert.doesNotMatch(doc.text(), /Gone soon/);
  ({ model } = applyEdit(doc, [{ op: "delete", section: "s1" }]));
  assert.doesNotMatch(doc.text(), /New bold/);
  assert.equal(model.ranges.k_s1, undefined);
  assert.match(rangeText(doc, model, "k_s2"), /^Two\nStays\./);
});

test("replace-section swaps a section's content and keeps its range", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Old.</p></section><section id="s2"><h2>Two</h2><p>Next.</p></section>`));
  const { model } = applyEdit(doc, [{ op: "replace-section", section: "s1", html: `<section id="s1"><h2>One, revised</h2><p>New.</p></section>` }]);
  assert.equal(rangeText(doc, model, "k_s1"), "One, revised\nNew.\n");
  assert.match(rangeText(doc, model, "k_s2"), /^Two\nNext\./);
  assert.doesNotMatch(doc.text(), /Old\./);
});

test("several operations in one edit are applied from the end so indices hold", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Alpha.</p></section><section id="s2"><h2>Two</h2><p>Beta.</p></section>`));
  const { model } = applyEdit(doc, [
    { op: "replace-text", find: "Alpha", replace: "Alpha, longer now" },
    { op: "insert", after: "s1", html: "<p>Inserted.</p>" },
    { op: "replace-text", find: "Beta", replace: "B" },
  ]);
  assert.match(doc.text(), /One\nAlpha, longer now\.\nInserted\.\nTwo\nB\./);
  assert.match(rangeText(doc, model, "k_s1"), /Inserted\.\n$/);
  assert.throws(() => applyEdit(doc, [{ op: "replace-text", find: "Inserted", replace: "x" }, { op: "delete", from: model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("Inserted"))).handle }]), /overlapping/);
});

test("comments and replies are outbound; they anchor where asked and resolve", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Please confirm the date.</p></section>`));
  let model = readDocument(doc.get());
  const prepared = prepareOps(model, [{ op: "comment", in: "s1", find: "the date", text: "Is the 14th right?" }], { convert: () => ({ blocks: [], shots: [], images: new Map(), notes: [] }) });
  assert.equal(prepared.outbound, true);
  ({ model } = applyEdit(doc, [{ op: "comment", in: "s1", find: "the date", text: "Is the 14th right?" }]));
  assert.equal(model.comments[0].quote, "the date");
  assert.equal(model.comments[0].section, "s1");
  ({ model } = applyEdit(doc, [{ op: "reply", comment: "c1", text: "Confirmed.", resolve: true }]));
  assert.equal(model.comments[0].status, "RESOLVED");
  assert.equal(model.comments[0].replies[0].text, "Confirmed.");
  const resolveOnly = prepareOps(model, [{ op: "reply", comment: "c1", reopen: true }], { convert: () => null });
  assert.equal(resolveOnly.outbound, false);
});

test("deleting the paragraph right before a table keeps the newline the table needs", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Lead-in.</p><div class="table-wrap"><table><tr><td>x</td></tr></table></div></section>`));
  const model = readDocument(doc.get());
  const lead = model.paragraphs.find((p) => p.runs.some((r) => r.content.startsWith("Lead-in")));
  applyEdit(doc, [{ op: "delete", from: lead.handle }]);
  assert.doesNotMatch(doc.text(), /Lead-in/);
});

test("Doc ids, fonts, and image sizes", () => {
  assert.equal(docIdFrom("https://docs.google.com/document/d/1uMxt-L0ekHmWSLQh1CpGhLE5SyJCC2sbm18pURyjuFU/edit?tab=t.0"), "1uMxt-L0ekHmWSLQh1CpGhLE5SyJCC2sbm18pURyjuFU");
  assert.equal(docIdFrom("not a doc"), null);
  assert.equal(fontFamily("system-ui, \"Inter Tight\", sans-serif"), "Inter Tight");
  assert.equal(fontFamily("-apple-system, sans-serif"), null);
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });
});

test("the CLI refuses outbound operations without --outbound and dry-runs others offline", async () => {
  const cache = mkdtempSync(path.join(os.tmpdir(), "gdoc-cache-"));
  process.env.HRB_CACHE_DIR = cache;
  const { main } = await import(`../scripts/gdoc.mjs?cache=${Date.now()}`);
  const { doc } = render(report(`<section id="s1"><h2>One</h2><p>Text here.</p></section>`));
  const json = doc.get({ commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED" });
  mkdirSync(path.join(cache, "gdoc", doc.id), { recursive: true });
  writeFileSync(path.join(cache, "gdoc", doc.id, `${json.revisionId}.rev.json`), JSON.stringify({ readAt: new Date().toISOString(), json }));
  const ops = path.join(cache, "ops.json");
  const lines = [];
  writeFileSync(ops, JSON.stringify([{ op: "comment", on: "s1", text: "Hi" }]));
  const errors = [];
  const originalError = console.error;
  console.error = (line) => errors.push(line);
  try {
    assert.equal(await main(["edit", doc.id, "--ops", ops, "--dry-run"], (l) => lines.push(l)), 1);
    assert.match(errors.join("\n"), /--outbound/);
    writeFileSync(ops, JSON.stringify([{ op: "replace-text", find: "Text", replace: "Words" }]));
    assert.equal(await main(["edit", doc.id, "--ops", ops, "--dry-run"], (l) => lines.push(l)), 0);
    assert.match(lines.join("\n"), /as suggestions[\s\S]*replace "Text" → "Words"/);
    assert.equal(await main(["share", doc.id, "--to", "not-an-email"], () => {}), 1);
  } finally {
    console.error = originalError;
    delete process.env.HRB_CACHE_DIR;
  }
});

test("a question card inserted as a suggestion gets exact ranges, before and after it is accepted", () => {
  const { doc } = render(report(`<section id="s1"><h2>One</h2><article class="question" id="q1"><h3>First?</h3><p class="answer"></p></article></section><section id="s2"><h2>Two</h2><p>Next.</p></section>`));
  let { model } = applyEdit(doc, [{ op: "insert", after: "s1", html: `<article class="question" id="q2"><h3>Second?</h3><p class="rec">Yes.</p><p class="answer"></p></article>` }], { suggest: true });
  assert.equal(rangeText(doc, model, "k_q2"), "Q2. Second?\nRecommendation: Yes.\nAnswer\nNot answered yet\n");
  assert.match(rangeText(doc, model, "k_s1"), /Q2\. Second\?/);
  assert.match(rangeText(doc, model, "k_s2"), /^Two\nNext\./);
  assert.doesNotMatch(rangeText(doc, model, "k_q1"), /Second/);
  assert.equal(rangeText(doc, model, "k_q2_answer"), ANSWER_PLACEHOLDER);
  applyEdit(doc, model.suggestions.map((g) => ({ op: "accept", suggestion: g.handle })));
  model = readDocument(doc.get());
  assert.match(rangeText(doc, model, "k_s2"), /^Two\nNext\./);
  assert.match(doc.text(), /Not answered yet\n\]Two\n/);
});
