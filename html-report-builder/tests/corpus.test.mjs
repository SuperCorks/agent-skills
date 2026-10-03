// Opt-in robustness check against real reports, which are never committed. Set
// HR_CORPUS_LIST to a file listing HTML paths (one per line), or HR_CORPUS_DIR to a folder.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { tokenize } from "../scripts/lib/scan.mjs";

function corpus() {
  if (process.env.HR_CORPUS_LIST) return readFileSync(process.env.HR_CORPUS_LIST, "utf8").split("\n").filter(Boolean);
  if (!process.env.HR_CORPUS_DIR) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.html?$/i.test(entry)) files.push(full);
    }
  };
  walk(process.env.HR_CORPUS_DIR);
  return files;
}

const files = corpus();

test("corpus: tokens round-trip and build preserves authored bytes", { skip: files.length ? false : "set HR_CORPUS_LIST or HR_CORPUS_DIR" }, () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(tokenize(source).map((t) => source.slice(t.start, t.end)).join(""), source, file);
    const { output } = buildSource(source);
    assert.equal(buildSource(output).output, output, `idempotent: ${file}`);
  }
});
