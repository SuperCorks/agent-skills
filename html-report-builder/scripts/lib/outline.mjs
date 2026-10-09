import { readFileSync } from "node:fs";
import { ancestors, attr, classes, lineOf, lineStarts, normalizeText, parse, textContent } from "./scan.mjs";
import { tocSections } from "./build.mjs";
import { readComments } from "./comments.mjs";

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/**
 * A compact map of a report for targeted revisions: section line ranges and sizes, plus
 * every question with its answer, every finding, and every review comment. Agents read this
 * instead of the file.
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
  const main = doc.elements.find((e) => e.name === "main");
  const children = main ? main.children : [];
  const slides = children.filter((c) => classes(c).includes("slide")).map((slide, i) => {
    const heading = slide.children.find((c) => c.name === "h1" || c.name === "h2");
    const next = children[children.indexOf(slide) + 1];
    const notes = next && classes(next).includes("notes") ? findText(next) : "";
    const layout = ["cover", "statement", "divider"].find((k) => classes(slide).includes(k)) || null;
    return {
      n: i + 1, id: attr(slide, "id"), layout, title: heading ? findText(heading) : "", from: line(slide.start), to: line((next && notes ? next : slide).end - 1),
      words: findText(slide).split(" ").filter(Boolean).length, notesWords: notes ? notes.split(" ").filter(Boolean).length : 0
    };
  });
  const where = (element) => {
    const host = element && [element, ...ancestors(element)].find((e) => attr(e, "id") && (e.name === "section" || classes(e).includes("slide") || classes(e).includes("question") || classes(e).includes("finding")));
    return host ? attr(host, "id") : null;
  };
  const comments = readComments(source, doc).threads.map((t) => ({
    id: t.id, status: t.status, pinned: Boolean(t.anchor), section: where(t.anchor), line: t.anchor ? line(t.anchor.start) : line(t.element.start),
    quote: t.quote, entries: t.entries
  }));
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
    slides,
    questions: cards("question"),
    findings: cards("finding"),
    comments
  };
}

export function formatOutline(data) {
  const out = [];
  out.push(`${data.title || "(untitled)"} | template: ${data.template || "none"} | audience: ${data.audience} | runtime: ${data.runtime || "not built"} | ${kb(data.bytes)}, ${data.lines} lines`);
  out.push("Generated runtime lines contain data-hr-runtime / data-hr-generated; skip them when reading.");
  if (data.hero) out.push(`hero          L${data.hero.from}-${data.hero.to}`);
  if (data.slides.length) {
    out.push(`Slides (${data.slides.length}); line ranges include each slide's notes:`);
    for (const s of data.slides) {
      out.push(`  ${String(s.n).padStart(2)} #${(s.id || "?").padEnd(5)} L${s.from}-${s.to}`.padEnd(26) + `${String(s.words).padStart(3)} words, notes ${s.notesWords ? `${s.notesWords} words` : "none"}${s.layout ? `, ${s.layout}` : ""}  ${clip(s.title, 70)}`);
    }
  }
  if (!data.slides.length) for (const s of data.sections) out.push(`#${s.id.padEnd(13)} L${s.from}-${s.to}`.padEnd(30) + `${kb(s.bytes).padStart(9)}  ${clip(s.label, 70)}`);
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
  const open = data.comments.filter((c) => c.status === "open");
  if (data.comments.length) {
    const resolved = data.comments.length - open.length;
    out.push("", `Comments (${open.length} open${resolved ? `, ${resolved} resolved` : ""}); reply or resolve in the store after <main>:`);
    for (const c of open) {
      const place = c.pinned ? `${c.section ? `#${c.section} ` : ""}L${c.line}` : "detached (its part was deleted)";
      out.push(`  ${c.id} ${place}  on "${clip(c.quote, 60)}"`);
      for (const e of c.entries) out.push(`      ${e.by || "?"}: ${clip(e.text.replace(/\s+/g, " "), 160)}`);
    }
  }
  return out.join("\n");
}

export function outlineFile(file) {
  return outlineData(readFileSync(file, "utf8"));
}
