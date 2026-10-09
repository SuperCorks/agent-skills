import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";
import { formatOutline, outlineData } from "../scripts/lib/outline.mjs";
import { SKILL_DIR, loadRuntime } from "../scripts/lib/runtime.mjs";
import { deckSource, writeDeck } from "./deck.mjs";

const deck = (slides, attrs = 'data-template="slides" data-audience="client"') => buildSource(`<!doctype html>
<html lang="en" ${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deck</title>
</head>
<body>
<main class="deck">
${slides}
</main>
</body>
</html>
`).output;
const cover = '<section class="slide cover" id="s1"><h1>Move bookings safely</h1></section>\n<aside class="notes"><p>Open.</p></aside>';
const warnings = (source) => checkSource(source).warnings.join("\n");

test("only decks get the deck runtime", () => {
  const report = buildSource(readFileSync(path.join(SKILL_DIR, "assets/templates/findings.html"), "utf8")).output;
  assert.doesNotMatch(report, /hr-presenting/);
  const built = deck(cover);
  assert.match(built, /hr-presenting/);
  assert.match(built, /\.slide\{/);
  const runtime = loadRuntime("slides");
  assert.ok(runtime.css.length - loadRuntime().css.length <= 12 * 1024, "deck CSS budget");
  assert.ok(runtime.js.length - loadRuntime().js.length <= 9 * 1024, "deck JS budget");
  assert.doesNotThrow(() => new Function(runtime.js));
});

test("deck classes are only in the vocabulary for decks", () => {
  assert.doesNotMatch(warnings(deck(cover)), /vocabulary/);
  const report = buildSource(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T</title></head><body><main><h1>T</h1><section class="slide" id="a"><h2>A slide in a report</h2></section></main></body></html>`).output;
  assert.match(warnings(report), /vocabulary.*slide/);
});

test("the sample deck and its generator pass check cleanly", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hr-deck-test-"));
  const file = writeDeck(dir);
  const result = checkSource(readFileSync(file, "utf8"), { file });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.match(deckSource(), /class="slide cover"/);
});

test("deck checks: cover first, takeaway titles, word budget, notes placement", () => {
  assert.match(warnings(deck('<section class="slide" id="s1"><h2>Starts without a cover slide here</h2></section>')), /first slide should be the cover/);
  assert.match(warnings(deck(`${cover}<section class="slide" id="s2"><h2>Options</h2></section>`)), /#s2 title "Options" is a label/);
  assert.doesNotMatch(warnings(deck(`${cover}<section class="slide divider" id="s2"><h2>Next steps</h2></section>`)), /is a label/);
  assert.match(warnings(deck(`${cover}<section class="slide" id="s2"><p>No title here at all.</p></section>`)), /#s2 has no <h2> title/);
  const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");
  assert.match(warnings(deck(`${cover}<section class="slide" id="s2"><h2>This slide says far too much</h2><p>${long}</p></section>`)), /#s2 has 9\d words/);
  assert.match(warnings(deck(`${cover}<aside class="notes"><p>Orphan.</p></aside>`)), /must directly follow the slide/);
});

test("client decks flag internal tool names, including in notes", () => {
  const notes = `${cover.replace("<p>Open.</p>", "<p>From the merged Codex and Claude audit.</p>")}`;
  assert.match(warnings(deck(notes)), /internal tools \(Codex, Claude\)/);
  assert.doesNotMatch(warnings(deck(notes, 'data-template="slides" data-audience="internal"')), /internal tools/);
});

test("outline lists slides with word counts and notes", () => {
  const data = outlineData(deckSource());
  assert.equal(data.slides.length, 11);
  assert.deepEqual(data.slides[0], { ...data.slides[0], n: 1, id: "s1", layout: "cover", title: "Move bookings without losing a sale" });
  assert.ok(data.slides.every((s) => s.notesWords > 0));
  const text = formatOutline(data);
  assert.match(text, /Slides \(11\)/);
  assert.match(text, / 11 #s11 .*divider/);
});

test("slides.md snippets only use classes the deck runtime defines", () => {
  const guide = readFileSync(path.join(SKILL_DIR, "references/slides.md"), "utf8");
  const snippets = [...guide.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
  const classes = loadRuntime("slides").classes;
  const used = [...new Set([...snippets.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))];
  assert.deepEqual(used.filter((c) => !classes.has(c)), []);
});
