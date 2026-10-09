#!/usr/bin/env node
// html-report-builder CLI: build, check, export, and outline self-contained HTML reports.
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFile, exportFile } from "./lib/build.mjs";
import { checkFile } from "./lib/check.mjs";
import { formatOutline, outlineFile } from "./lib/outline.mjs";
import { renderMediaFile } from "./lib/media.mjs";
import { pdfFile } from "./lib/pdf.mjs";

const USAGE = `Usage:
  report.mjs build <file.html> [--redraw]  refresh runtime and TOC, draw chart snapshots and diagrams, inline images, check
  report.mjs check <file.html> [--json]    validate without changing the file
  report.mjs export <file.html> --out <dir>  publish copy with images as files in <dir>/<slug>.assets/
  report.mjs outline <file.html> [--json]  section line ranges, questions with answers, findings, review comments
  report.mjs pdf <file.html> [--out file.pdf] [--skip s3,s7] [--size Letter|A4]  print to PDF (decks: one slide per page)`;

// import.meta.url is always a real path, while argv[1] keeps any symlink used to reach the
// script (a symlinked skills folder). Comparing them unresolved would exit silently.
export function isEntrypoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(moduleUrl) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

function printCheck(result, label) {
  for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  if (result.errors.length) console.error(`${label}: ${result.errors.length} error(s), ${result.warnings.length} warning(s).`);
  else console.log(`${label}: passed${result.warnings.length ? ` with ${result.warnings.length} warning(s)` : ""}.`);
}

export async function main(argv = process.argv.slice(2)) {
  const [command, file, ...rest] = argv;
  const flag = (name) => rest.includes(name);
  const option = (name) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  if (!command || !file || command === "--help" || command === "-h") {
    console.log(USAGE);
    return command && file ? 0 : 2;
  }
  const target = path.resolve(file);
  try {
    if (command === "build") {
      const media = await renderMediaFile(target, { force: flag("--redraw") });
      for (const note of media.notes) console.log(`NOTE: ${note}`);
      if (media.drawn.charts || media.drawn.diagrams) console.log(`Drew ${media.drawn.charts} chart snapshot(s) and ${media.drawn.diagrams} diagram(s)`);
      const result = buildFile(target);
      for (const note of result.notes) console.log(`NOTE: ${note}`);
      console.log(result.changed || media.changed ? `Built ${file}` : `${file} already up to date`);
      const checked = checkFile(target);
      printCheck(checked, "Check");
      return checked.errors.length ? 1 : 0;
    }
    if (command === "check") {
      const result = checkFile(target);
      if (flag("--json")) console.log(JSON.stringify(result, null, 2));
      else printCheck(result, "Check");
      return result.errors.length ? 1 : 0;
    }
    if (command === "export") {
      const out = option("--out");
      if (!out) { console.error("export needs --out <dir>"); return 2; }
      const result = exportFile(target, path.resolve(out));
      console.log(`Exported ${result.file}${result.assets.length ? ` with ${result.assets.length} image file(s)` : ""}`);
      for (const asset of result.assets) console.log(`  ${asset}`);
      const checked = checkFile(result.file, { mode: "export" });
      printCheck(checked, "Export check");
      if (!checked.errors.length) console.log(`Upload the whole folder ${path.resolve(out)} (the .html plus its .assets folder).`);
      return checked.errors.length ? 1 : 0;
    }
    if (command === "pdf") {
      const skip = (option("--skip") || "").split(",").map((id) => id.trim()).filter(Boolean);
      const result = await pdfFile(target, { out: option("--out"), skip, size: option("--size") || "Letter" });
      console.log(`Wrote ${result.file}${skip.length ? ` without ${skip.join(", ")}` : ""}`);
      if (result.cut.length) console.log(`WARNING: content is cut off on ${result.cut.map((id) => `#${id}`).join(", ")} in the PDF: shorten those slides or move detail to the notes`);
      return 0;
    }
    if (command === "outline") {
      const data = outlineFile(target);
      console.log(flag("--json") ? JSON.stringify(data, null, 2) : formatOutline(data));
      return 0;
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
  console.error(`Unknown command: ${command}\n${USAGE}`);
  return 2;
}

if (isEntrypoint(import.meta.url)) main().then((code) => { process.exitCode = code; });
