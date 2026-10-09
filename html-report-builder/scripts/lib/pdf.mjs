// `report.mjs pdf`: print a report or deck to PDF in headless Chrome, from a copy without review
// comments. Decks use their own 960x540 page per slide with notes hidden, and --skip leaves out
// chosen slides; reports print on Letter (or A4) with the report's print styles. Charts print
// from their build snapshots and diagrams from their light drawings.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripComments } from "./comments.mjs";
import { attr, classes, escapeHtml, parse, splice } from "./scan.mjs";
import { withBrowser } from "./vendor.mjs";

/** The source to print: comments stripped, skipped slides (and their notes) hidden, links resolving next to the original. */
export function printableSource(source, { skip = [], baseHref = "" } = {}) {
  let out = stripComments(source);
  const doc = parse(out);
  const edits = [];
  const wanted = new Set(skip.map((id) => id.replace(/^#/, "")));
  const missing = new Set(wanted);
  const hide = (element) => edits.push({ start: element.open.start + 1 + element.name.length, end: element.open.start + 1 + element.name.length, text: " hidden" });
  for (const slide of doc.elements.filter((e) => classes(e).includes("slide") && wanted.has(attr(e, "id")))) {
    missing.delete(attr(slide, "id"));
    hide(slide);
    const siblings = slide.parent ? slide.parent.children : [];
    const next = siblings[siblings.indexOf(slide) + 1];
    if (next && next.name === "aside" && classes(next).includes("notes")) hide(next);
  }
  const head = doc.elements.find((e) => e.name === "head");
  if (baseHref && head) edits.push({ start: head.innerStart, end: head.innerStart, text: `<base href="${escapeHtml(baseHref)}">` });
  out = edits.length ? splice(out, edits) : out;
  return { source: out, missing: [...missing], deck: doc.elements.some((e) => e.name === "html" && attr(e, "data-template") === "slides") };
}

export async function pdfFile(file, { out, skip = [], size = "Letter", runBrowser = withBrowser } = {}) {
  const target = path.resolve(file);
  const output = path.resolve(out || target.replace(/\.html?$/i, ".pdf"));
  const baseHref = pathToFileURL(path.dirname(target) + path.sep).href;
  const { source, missing, deck } = printableSource(readFileSync(target, "utf8"), { skip, baseHref });
  if (missing.length) throw new Error(`no slide with id ${missing.map((id) => `#${id}`).join(", ")}`);
  let cut = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), "hrb-pdf-"));
  const copy = path.join(dir, path.basename(target));
  writeFileSync(copy, source);
  try {
    await runBrowser(async (browser) => {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(copy).href, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      // Fit is checked in the print layout itself: fonts and sizes can differ from the screen.
      if (deck) cut = await page.evaluate(() => [...document.querySelectorAll(".slide:not([hidden])")].filter((slide) => slide.scrollHeight > slide.clientHeight + 2 || slide.scrollWidth > slide.clientWidth + 2).map((slide) => slide.id || "?"));
      await page.pdf(deck
        ? { path: output, printBackground: true, preferCSSPageSize: true }
        : { path: output, printBackground: true, format: size, margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" } });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { file: output, deck, cut };
}
