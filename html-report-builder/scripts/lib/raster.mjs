// Photograph report parts a Doc cannot draw (chart snapshots, diagrams, mockups, bars,
// roadmaps, SVG images) as 2x PNGs, in the same print layout `report.mjs pdf` uses.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { escapeHtml, splice } from "./scan.mjs";
import { withBrowser } from "./vendor.mjs";

/**
 * `source` is the exact string the shots' offsets point into; `shots` are {key, start, end}.
 * Returns {images: Map key -> {bytes, mime, cssWidth}, notes}.
 */
export async function rasterize(source, shots, { runBrowser = withBrowser, width = 820 } = {}) {
  const images = new Map();
  const notes = [];
  if (!shots.length) return { images, notes };
  const edits = shots.map((shot) => {
    const at = source.indexOf(">", shot.start);
    const selfClosing = source[at - 1] === "/";
    return { start: selfClosing ? at - 1 : at, end: selfClosing ? at - 1 : at, text: ` data-gdoc-shot="${escapeHtml(shot.key)}"` };
  });
  const marked = splice(source, edits);
  const dir = mkdtempSync(path.join(os.tmpdir(), "gdoc-shots-"));
  const file = path.join(dir, "report.html");
  writeFileSync(file, marked);
  try {
    await runBrowser(async (browser) => {
      const context = await browser.newContext({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      for (const shot of shots) {
        const element = page.locator(`[data-gdoc-shot="${shot.key}"]`).first();
        try {
          const box = await element.boundingBox();
          if (!box || box.width < 2 || box.height < 2) { notes.push(`${shot.key}: nothing visible to draw`); continue; }
          const bytes = await element.screenshot({ type: "png", animations: "disabled" });
          images.set(shot.key, { bytes, mime: "image/png", cssWidth: box.width });
        } catch (error) {
          notes.push(`${shot.key}: could not be drawn (${error.message.split("\n")[0]})`);
        }
      }
      await context.close();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { images, notes };
}
