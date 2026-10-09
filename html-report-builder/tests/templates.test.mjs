import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkSource } from "../scripts/lib/check.mjs";
import { outlineData } from "../scripts/lib/outline.mjs";
import { SKILL_DIR, loadRuntime } from "../scripts/lib/runtime.mjs";
import { sectionTemplatesSource, slideTemplatesSource, writeTemplates } from "./templates.mjs";

// Snapshots and diagrams are drawn by the browser part of the build, which unit tests skip.
const MEDIA = /snapshot|drawing|charts are not interactive/;
const classesIn = (source) => [...new Set([...source.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))];

test("section and slide templates only use classes their runtime defines", () => {
  const report = loadRuntime().classes;
  const deck = loadRuntime("slides").classes;
  assert.deepEqual(classesIn(sectionTemplatesSource()).filter((c) => !report.has(c)), []);
  assert.deepEqual(classesIn(slideTemplatesSource()).filter((c) => !deck.has(c)), []);
});

test("every section template builds and checks cleanly", () => {
  const { sections } = writeTemplates(mkdtempSync(path.join(os.tmpdir(), "hr-templates-test-")));
  const result = checkSource(readFileSync(sections, "utf8"), { file: sections });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.filter((w) => !MEDIA.test(w) && !/template sections missing/.test(w)), []);
  const outline = outlineData(readFileSync(sections, "utf8"));
  assert.equal(outline.sections.length, 20);
  assert.equal(outline.questions.length, 2);
});

test("every slide template builds and checks cleanly, within the word budget", () => {
  const { slides } = writeTemplates(mkdtempSync(path.join(os.tmpdir(), "hr-templates-test-")));
  const source = readFileSync(slides, "utf8");
  const result = checkSource(source, { file: slides });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.filter((w) => !MEDIA.test(w)), []);
  const outline = outlineData(source);
  assert.deepEqual(outline.slides.map((s) => s.id), Array.from({ length: 20 }, (_, i) => `s${i + 1}`));
  assert.ok(outline.slides.every((s) => s.notesWords > 0), "every slide has notes");
});

test("the catalogues list every template in order", () => {
  const read = (name) => readFileSync(path.join(SKILL_DIR, "references", name), "utf8");
  const headings = (name) => [...read(name).matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1]);
  const rows = (name, from) => [...read(name).split(from)[1].matchAll(/^\| (\d+) \| ([^|]+) \|/gm)].map((m) => m[2].trim());
  assert.equal(headings("section-templates.md").length, 20);
  assert.equal(rows("templates.md", "## Section templates").length, 20);
  assert.deepEqual(headings("slide-templates.md"), rows("slides.md", "## Slide templates"));
});
