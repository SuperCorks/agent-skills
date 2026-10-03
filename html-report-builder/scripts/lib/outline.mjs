import { readFileSync } from "node:fs";
import { ancestors, attr, classes, lineOf, lineStarts, normalizeText, parse, textContent } from "./scan.mjs";
import { tocSections } from "./build.mjs";

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/**
 * A compact map of a report for targeted revisions: section line ranges and sizes, plus
 * every question with its answer and every finding. Agents read this instead of the file.
 */
export function outlineData(source) {
  const doc = parse(source);
  const starts = lineStarts(source);
  const line = (offset) => lineOf(starts, offset);
  const html = doc.elements.find((e) => e.name === "html");
  const title = doc.elements.find((e) => e.name === "title");
  const runtime = doc.elements.find((e) => e.name === "style" && attr(e, "data-hr-runtime") !== null);
  const hero = doc.elements.find((e) => classes(e).includes("hero"));
  const findText = (element) => normalizeText(textContent(doc, element));
  const cards = (name) => doc.elements.filter((e) => classes(e).includes(name)).map((card) => {
    const heading = card.children.find((c) => /^h[2-4]$/.test(c.name));
    const answer = doc.elements.find((e) => classes(e).includes("answer") && ancestors(e).includes(card));
    const tone = ["ok", "warn", "risk", "info"].find((t) => classes(card).includes(t)) || null;
    return {
      id: attr(card, "id"), line: line(card.start), title: heading ? findText(heading) : "",
      answer: answer ? findText(answer) : null, tone
    };
  });
  return {
    title: title ? findText(title) : "",
    template: html ? attr(html, "data-template") : null,
    audience: (html && attr(html, "data-audience")) || "internal",
    runtime: runtime ? attr(runtime, "data-hr-runtime") : null,
    bytes: Buffer.byteLength(source),
    lines: starts.length,
    hero: hero ? { from: line(hero.start), to: line(hero.end - 1) } : null,
    sections: tocSections(doc).map((s) => ({
      id: s.id, label: s.label, from: line(s.element.start), to: line(s.element.end - 1),
      bytes: Buffer.byteLength(source.slice(s.element.start, s.element.end))
    })),
    questions: cards("question"),
    findings: cards("finding")
  };
}

export function formatOutline(data) {
  const out = [];
  out.push(`${data.title || "(untitled)"} | template: ${data.template || "none"} | audience: ${data.audience} | runtime: ${data.runtime || "not built"} | ${kb(data.bytes)}, ${data.lines} lines`);
  out.push("Generated runtime lines contain data-hr-runtime / data-hr-generated; skip them when reading.");
  if (data.hero) out.push(`hero          L${data.hero.from}-${data.hero.to}`);
  for (const s of data.sections) out.push(`#${s.id.padEnd(13)} L${s.from}-${s.to}`.padEnd(30) + `${kb(s.bytes).padStart(9)}  ${clip(s.label, 70)}`);
  if (data.questions.length) {
    out.push("", "Questions:");
    data.questions.forEach((q, i) => {
      const status = q.answer ? `answered: ${clip(q.answer, 120)}` : "open";
      out.push(`  Q${i + 1} #${q.id || "?"} L${q.line}  ${clip(q.title, 90)}`, `      ${status}`);
    });
  }
  if (data.findings.length) {
    out.push("", "Findings:");
    data.findings.forEach((f, i) => out.push(`  F${i + 1} #${f.id || "?"} L${f.line}${f.tone ? ` [${f.tone}]` : ""}  ${clip(f.title, 90)}`));
  }
  return out.join("\n");
}

export function outlineFile(file) {
  return outlineData(readFileSync(file, "utf8"));
}
