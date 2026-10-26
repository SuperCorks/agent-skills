// Turn a built report (or an HTML fragment) into the block list a Google Doc is written from:
// paragraphs with styled runs, tables of cell blocks, and images. Labels the report draws with
// CSS ("Q1", "Recommendation", "Answer", status marks, "Exit:", "Before"/"After") become real
// text, and visual-only components (charts, diagrams, mockups, bars, roadmaps) become shots the
// browser takes. Every section, question, finding, and figure id becomes a named range `k_<id>`,
// and each question's answer cell becomes `k_<id>_answer`, so agents can address them later.
import { attr, classes, decodeEntities, parse, tokensIn } from "./scan.mjs";

export const CONTENT_WIDTH = 468; // points: Letter with Docs' default one-inch margins
export const ANSWER_PLACEHOLDER = "Not answered yet";
const TONES = ["ok", "warn", "risk", "info"];
const MARKS = { ok: "✓", warn: "◐", risk: "✕", info: "○" };
const SKIP_TAGS = new Set(["script", "style", "template", "nav", "noscript", "head", "title", "meta", "link", "svg", "math", "iframe", "button", "input", "select", "textarea", "aside"]);
const PHRASING = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "del", "ins", "label", "progress", "meter", "img", "#text"]);
const SHOT_CLASSES = ["device", "devices", "shots", "pins", "bars", "roadmap"];
const HEADING_STYLE = { h2: "HEADING_1", h3: "HEADING_2", h4: "HEADING_3", h5: "HEADING_4", h6: "HEADING_5" };
const DOC_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

const toneOf = (element) => classes(element).find((c) => TONES.includes(c)) || null;
const isElement = (node) => node && node.name !== "#text";

/** Child nodes in order: text segments ({name: "#text", text}) between child elements. */
export function childNodes(doc, element) {
  const nodes = [];
  let cursor = element.innerStart;
  const pushText = (start, end) => {
    if (end <= start) return;
    for (const token of tokensIn(doc, start, end)) {
      if (token.type !== "text") continue;
      const raw = doc.source.slice(token.start, token.end);
      nodes.push({ name: "#text", text: token.raw ? raw : decodeEntities(raw) });
    }
  };
  for (const child of element.children) {
    pushText(cursor, child.start);
    nodes.push(child);
    cursor = Math.max(cursor, child.end);
  }
  pushText(cursor, element.innerEnd);
  return nodes;
}

const sameStyle = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("text");
  for (const key of keys) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  return true;
};

/** Collapse whitespace like a browser, trim the paragraph's ends, and merge equal neighbours. */
export function normalizeRuns(runs, { pre = false } = {}) {
  const out = [];
  for (const run of runs) {
    let text = pre ? run.text.replace(/\r\n?/g, "\n") : run.text.replace(/[\t\n\r\f ]+/g, " ");
    text = text.replace(/[\u0000-\u0008\u000c\u000e-\u001f\u007f]/g, "");
    if (pre) text = text.replace(/\n/g, "\u000b");
    if (!text) continue;
    out.push({ ...run, text });
  }
  if (!pre) {
    // A space after a space (or a line break) collapses, even across runs.
    for (let i = 0; i < out.length; i++) {
      const before = i === 0 ? "\u000b" : out[i - 1].text.at(-1);
      if ((before === " " || before === "\u000b") && out[i].text.startsWith(" ")) out[i].text = out[i].text.slice(1);
    }
    if (out.length) out[0].text = out[0].text.replace(/^ +/, "");
    if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, "");
    for (const run of out) run.text = run.text.replace(/ \u000b/g, "\u000b").replace(/\u000b /g, "\u000b");
  }
  const merged = [];
  for (const run of out) {
    if (!run.text) continue;
    const last = merged.at(-1);
    if (last && sameStyle(last, run)) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

export const runsText = (runs) => runs.map((r) => r.text).join("");

/**
 * Convert report HTML to blocks. Options:
 * - source: the printable report source (comments stripped).
 * - fragment: true when converting an edit fragment (numbering then follows ids like q3).
 * - shotId(element): returns a key for an element the browser must photograph.
 * - imageBytes(src): returns {bytes, mime} for an image reference, or null.
 */
export function convertReport(source, { fragment = false, shotId = null, imageBytes = null, palette } = {}) {
  const doc = parse(source);
  const html = doc.elements.find((e) => e.name === "html");
  const audience = (html && attr(html, "data-audience")) || "internal";
  const template = html && attr(html, "data-template");
  if (template === "slides") throw new Error("decks are not converted to Google Docs; share the deck as a Kernel link or PDF");
  const numbered = html ? attr(html, "data-numbered") !== null : false;
  const notes = [];
  const blocks = [];
  const shots = [];
  const images = new Map();
  const counters = { q: 0, f: 0, section: 0, list: 0 };
  const tone = (name) => palette[name] || palette.muted;

  const imageFor = (element) => {
    const src = attr(element, "src") || "";
    const found = imageBytes ? imageBytes(src, element) : null;
    if (found && DOC_IMAGE_TYPES.has(found.mime)) {
      const key = `img${images.size + 1}`;
      images.set(key, found);
      return { type: "image", key, alt: attr(element, "alt") || "", width: attr(element, "width") };
    }
    return shot(element);
  };
  const shot = (element) => {
    if (!shotId) { notes.push(`left out a ${describe(element)}: drawing it needs a browser`); return null; }
    const key = shotId(element);
    shots.push({ key, start: element.start, end: element.end });
    return { type: "image", key, alt: attr(element, "alt") || "", shot: true };
  };

  // ---------- inline runs ----------
  function runsOf(element, base = {}) {
    const out = [];
    const walk = (node, style) => {
      if (node.name === "#text") { out.push({ ...style, text: node.text }); return; }
      if (attr(node, "data-hr-generated") !== null && !classes(node).includes("chart-static")) return;
      if (SKIP_TAGS.has(node.name) && node.name !== "svg") return;
      if (node.name === "svg") return;
      const cls = classes(node);
      if (cls.includes("internal") && audience === "client") return;
      if (cls.includes("pill") && audience === "client" && cls.some((c) => ["observed", "executed", "inferred", "unknown"].includes(c))) return;
      let next = { ...style };
      switch (node.name) {
        case "br": out.push({ ...style, text: "\u000b" }); return;
        case "img": return; // inline images are left out; block images are handled by blocks
        case "progress": case "meter": {
          const label = childNodes(doc, node).map((n) => n.text || "").join("").trim();
          const value = Number(attr(node, "value"));
          out.push({ ...style, text: label || (Number.isFinite(value) ? `${Math.round(value * (node.name === "progress" && !attr(node, "max") ? 100 : 1))}%` : "") });
          return;
        }
        case "b": case "strong": next.bold = true; break;
        case "i": case "em": case "cite": case "dfn": case "var": next.italic = true; break;
        case "u": case "ins": next.underline = true; break;
        case "s": case "del": next.strike = true; break;
        case "code": case "kbd": case "samp": next.code = true; break;
        case "mark": next.bg = palette.mark; break;
        case "small": next.small = true; next.color = next.color || palette.muted; break;
        case "sup": next.sup = true; break;
        case "sub": next.sub = true; break;
        case "q": out.push({ ...style, text: "“" }); break;
        case "a": {
          const href = attr(node, "href") || "";
          if (/^#./.test(href)) next.anchor = href.slice(1);
          else if (/^(https?:|mailto:|tel:)/i.test(href)) next.link = href;
          break;
        }
        default: break;
      }
      if (cls.includes("muted")) next.color = palette.muted;
      if (cls.includes("pill")) {
        const t = toneOf(node);
        next.bold = true;
        next.color = t ? tone(t) : palette.muted;
        next.bg = palette.tint(t ? tone(t) : palette.muted, 0.12);
        out.push({ ...next, text: " " });
        for (const child of childNodes(doc, node)) walk(child, next);
        out.push({ ...next, text: " " });
        return;
      }
      for (const child of childNodes(doc, node)) walk(child, next);
      if (node.name === "q") out.push({ ...style, text: "”" });
    };
    for (const child of childNodes(doc, element)) walk(child, base);
    return out;
  }

  const para = (runs, extra = {}) => ({ type: "p", runs: normalizeRuns(runs, { pre: extra.pre }), ...extra, pre: undefined });
  const textRuns = (text, style = {}) => [{ ...style, text }];
  const label = (text, color) => ({ text, bold: true, color: color || palette.muted });

  // ---------- block walker ----------
  // `ctx`: { cell: bool (inside a table cell), list: {kind, level}|null, decorate(block) }
  function blocksOf(element, ctx) {
    const out = [];
    let inline = [];
    const flush = () => {
      const runs = normalizeRuns(inline);
      if (runs.length && runsText(runs).trim()) out.push(decorated({ type: "p", runs }, ctx));
      inline = [];
    };
    for (const node of childNodes(doc, element)) {
      if (node.name === "#text") { inline.push({ text: node.text }); continue; }
      if (PHRASING.has(node.name) && node.name !== "img") {
        inline.push(...runsOf({ ...node, children: [node], innerStart: node.start, innerEnd: node.end }));
        continue;
      }
      flush();
      out.push(...blockElement(node, ctx));
    }
    flush();
    return out;
  }

  const decorated = (block, ctx) => (ctx && ctx.decorate ? ctx.decorate(block) : block);

  // Range markers ride in the block stream and are resolved to indices when the Doc is written.
  // Containers that become table cells drop them: named ranges cover top-level content only.
  function withRange(id, produce) {
    const produced = produce();
    if (!id || !produced.some((b) => b.type !== "open" && b.type !== "close")) return produced;
    return [{ type: "open", name: `k_${id}` }, ...produced, { type: "close", name: `k_${id}` }];
  }

  function heading(element, ctx, prefix = []) {
    const runs = [...prefix, ...runsOf(element)];
    if (ctx.cell) return [decorated(para(runs.map((r) => ({ ...r, bold: true }))), ctx)];
    return [decorated(para(runs, { style: HEADING_STYLE[element.name] || "HEADING_3", keepWithNext: true }), ctx)];
  }

  function blockElement(element, ctx) {
    const cls = classes(element);
    const name = element.name;
    if (SKIP_TAGS.has(name)) return [];
    if (attr(element, "data-hr-generated") !== null) return [];
    if (cls.some((c) => c.startsWith("brand-logo"))) return [];
    if (attr(element, "hidden") !== null) return [];
    if (cls.includes("internal")) {
      if (audience === "client") { notes.push("left out an .internal block (client report)"); return []; }
      const t = palette.warn;
      const box = `internal${element.start}`;
      return [para([label("Internal", t)]), ...blocksOf(element, ctx)].map((b) => decorated(callout(t, box)(b), ctx));
    }
    const id = attr(element, "id");
    if (name === "header" && cls.includes("hero")) return hero(element);
    if (name === "section") return sectionBlocks(element, ctx, id);
    if (/^h[1-6]$/.test(name)) {
      if (name === "h1") return [para(runsOf(element), { style: ctx.cell ? undefined : "TITLE" })];
      return heading(element, ctx);
    }
    if (name === "p") {
      const runs = runsOf(element);
      if (cls.includes("gate")) return [decorated(para([{ text: "Exit: ", color: palette.muted }, ...runs.map((r) => ({ ...r, bold: true }))], { indent: ctx.indent }), ctx)];
      if (cls.includes("lede")) return [decorated(para(runs, { style: ctx.cell ? undefined : "SUBTITLE" }), ctx)];
      if (cls.includes("eyebrow")) return [decorated(para(runs.map((r) => ({ ...r, bold: true, smallCaps: true, color: palette.accent }))), ctx)];
      return [decorated(para(runs, { indent: ctx.indent }), ctx)];
    }
    if (name === "article" && cls.includes("question")) return withRange(id, () => question(element, ctx, id));
    if (name === "article" && cls.includes("finding")) return withRange(id, () => finding(element, ctx));
    if (cls.includes("callout")) {
      const t = toneOf(element) ? tone(toneOf(element)) : palette.muted;
      return blocksOf(element, { ...ctx, decorate: chain(ctx.decorate, callout(t, `callout${element.start}`)) });
    }
    if (cls.includes("tiles")) return [tiles(element)];
    if (cls.includes("grid")) return grid(element, ctx);
    if (cls.includes("table-wrap")) return blocksOf(element, ctx);
    if (name === "table") return [table(element)];
    if (name === "ol" && cls.includes("steps")) return steps(element, ctx, cls.includes("timeline"));
    if (cls.includes("lanes")) return [columnsTable(element.children.filter((c) => classes(c).includes("lane")), () => null)];
    if (cls.includes("flow")) return [decorated(flow(element), ctx)];
    if (cls.includes("compare")) return [compare(element)];
    if (cls.includes("options")) return [options(element)];
    if (cls.includes("checklist")) return checklist(element, ctx);
    if (cls.includes("chips")) return [decorated(chips(element), ctx)];
    if (cls.includes("terms")) return [terms(element)];
    if (cls.includes("sources")) return list(element, { ...ctx }, "bullet", (li) => sourceRuns(li));
    if ((cls.includes("pros") || cls.includes("cons")) && (name === "ul" || name === "ol")) {
      const good = cls.includes("pros");
      return element.children.filter((c) => c.name === "li").map((li) => decorated(para([{ text: good ? "+ " : "− ", bold: true, color: good ? palette.ok : palette.risk }, ...runsOf(li)], { indent: ctx.indent }), ctx));
    }
    if (cls.includes("keypoints")) return list(element, ctx, "number", (li) => runsOf(li));
    if (name === "ul" || name === "ol") return list(element, ctx, name === "ol" ? "number" : "bullet");
    if (name === "figure") return withRange(id, () => figure(element, ctx));
    if (SHOT_CLASSES.some((c) => cls.includes(c))) {
      const image = shot(element);
      return image ? [decorated({ ...image, align: "CENTER" }, ctx)] : [];
    }
    if (name === "pre") return codeBlock(element, null, ctx);
    if (name === "img") { const image = imageFor(element); return image ? [decorated({ ...image, align: "CENTER" }, ctx)] : []; }
    if (name === "details") {
      const summary = element.children.find((c) => c.name === "summary");
      const rest = { ...element, children: element.children.filter((c) => c !== summary), innerStart: summary ? summary.end : element.innerStart };
      return [...(summary ? [decorated(para(runsOf(summary).map((r) => ({ ...r, bold: true }))), ctx)] : []), ...blocksOf(rest, ctx)];
    }
    if (name === "blockquote") return blocksOf(element, { ...ctx, decorate: chain(ctx.decorate, (b) => b.type === "p" ? { ...b, runs: b.runs.map((r) => ({ ...r, italic: true })), border: palette.line, indent: (b.indent || 0) + 18 } : b) });
    if (name === "dl") {
      if (cls.includes("meta")) return [metaLine(element)];
      return dlPairs(element).map(([dt, dd]) => decorated(para([...runsOf(dt).map((r) => ({ ...r, bold: true })), { text: ": " }, ...(dd ? runsOf(dd) : [])]), ctx));
    }
    if (name === "hr") return [];
    if (["div", "main", "article", "header", "footer", "aside", "figcaption", "summary", "body", "html", "li", "dd", "dt", "caption", "legend", "fieldset", "form", "address", "center", "hgroup", "search"].includes(name) || !PHRASING.has(name)) return blocksOf(element, ctx);
    return [decorated(para(runsOf({ ...element, children: [element], innerStart: element.start, innerEnd: element.end })), ctx)];
  }

  const chain = (a, b) => (a ? (block) => a(b(block)) : b);
  const callout = (color, box) => (block) => block.type === "p" ? { ...block, shade: palette.tint(color, 0.07), border: color, box } : block;

  function sectionBlocks(element, ctx, id) {
    return withRange(id, () => {
      const out = [];
      let first = true;
      for (const node of childNodes(doc, element)) {
        if (first && isElement(node) && node.name === "h2") {
          first = false;
          const prefix = numbered && !ctx.cell ? [{ text: `${++counters.section}. ` }] : [];
          out.push(...heading(node, ctx, prefix));
          continue;
        }
        if (isElement(node)) first = false;
        if (node.name === "#text") { if (node.text.trim()) out.push(para([{ text: node.text }])); continue; }
        out.push(...blockElement(node, ctx));
      }
      return out;
    });
  }

  function hero(element) {
    const out = [];
    for (const child of element.children) {
      if (attr(child, "data-hr-generated") !== null || classes(child).some((c) => c.startsWith("brand-logo"))) continue;
      out.push(...blockElement(child, {}));
    }
    return out;
  }

  function metaLine(element) {
    const runs = [];
    for (const [dt, dd] of dlPairs(element)) {
      if (runs.length) runs.push({ text: "   ·   ", color: palette.muted });
      runs.push({ ...label(`${runsText(normalizeRuns(runsOf(dt)))}: `) });
      if (dd) runs.push(...runsOf(dd));
    }
    return para(runs);
  }

  function dlPairs(element) {
    const pairs = [];
    const items = element.children.flatMap((c) => (c.name === "div" ? c.children : [c]));
    for (const item of items) {
      if (item.name === "dt") pairs.push([item, null]);
      else if (item.name === "dd" && pairs.length && !pairs.at(-1)[1]) pairs.at(-1)[1] = item;
      else if (item.name === "dd") pairs.push([null, item]);
    }
    return pairs.filter(([dt]) => dt);
  }

  function question(element, ctx, id) {
    const n = fragment && /^q(\d+)$/i.test(id || "") ? Number(id.slice(1)) : ++counters.q;
    if (!fragment) counters.q = Math.max(counters.q, n);
    const out = [];
    const answerEl = element.children.find((c) => classes(c).includes("answer"));
    for (const child of element.children) {
      const cls = classes(child);
      if (child.name === "h3" || child.name === "h4") out.push(...heading(child, ctx, [{ text: `Q${n}. `, color: palette.accent }]));
      else if (cls.includes("rec")) out.push(decorated(para([label("Recommendation: ", palette.accent), ...runsOf(child)], { shade: palette.tint(palette.accent, 0.1), border: palette.accent, box: `rec${child.start}` }), ctx));
      else if (cls.includes("owner")) out.push(decorated(para([{ text: "Owner: ", color: palette.muted }, ...runsOf(child).map((r) => ({ ...r, color: r.color || palette.muted }))]), ctx));
      else if (cls.includes("links")) out.push(decorated(para([{ text: "Details: ", color: palette.muted }, ...runsOf(child)]), ctx));
      else if (child === answerEl) {
        const answer = normalizeRuns(runsOf(child));
        const answered = runsText(answer).trim().length > 0;
        out.push(decorated(para([label("Answer", answered ? palette.ok : palette.muted)], { keepWithNext: true }), ctx));
        out.push({
          type: "table", answerOf: id || `q${n}`,
          rows: [[{ blocks: [para(answered ? answer : [{ text: ANSWER_PLACEHOLDER, italic: true, color: palette.muted }])], bg: answered ? palette.tint(palette.ok, 0.08) : palette.tint(palette.muted, 0.05) }]],
          border: answered ? palette.tint(palette.ok, 0.5) : palette.line,
        });
      } else out.push(...blockElement(child, ctx));
    }
    return out;
  }

  function finding(element, ctx) {
    const id = attr(element, "id");
    const n = fragment && /^f(\d+)$/i.test(id || "") ? Number(id.slice(1)) : ++counters.f;
    if (!fragment) counters.f = Math.max(counters.f, n);
    const t = toneOf(element);
    const out = [];
    for (const child of element.children) {
      if (child.name === "h3" || child.name === "h4") out.push(...heading(child, ctx, [{ text: `F${n}. `, color: t ? tone(t) : palette.muted }]));
      else out.push(...blockElement(child, ctx));
    }
    return out;
  }

  function figure(element, ctx) {
    const cls = classes(element);
    const caption = element.children.find((c) => c.name === "figcaption");
    const captionPara = caption ? [decorated(para(runsOf(caption).map((r) => ({ ...r, italic: true, color: r.color || palette.muted })), { align: "CENTER" }), ctx)] : [];
    if (cls.includes("code")) return codeBlock(element.children.find((c) => c.name === "pre"), caption, ctx);
    if (cls.includes("chart")) {
      const target = doc.elements.find((e) => e.start >= element.start && e.end <= element.end && classes(e).includes("chart-static")) || element;
      if (target === element) notes.push(`chart "${caption ? runsText(normalizeRuns(runsOf(caption))) : "untitled"}" has no snapshot; build the report first`);
      const image = shot(target === element ? element : target);
      return [...(image ? [decorated({ ...image, align: "CENTER" }, ctx)] : []), ...captionPara];
    }
    if (cls.includes("diagram")) {
      const target = doc.elements.find((e) => e.start >= element.start && e.end <= element.end && classes(e).includes("diagram-light")) ||
        doc.elements.find((e) => e.start >= element.start && e.end <= element.end && classes(e).includes("diagram-svg"));
      if (!target) { notes.push("a diagram has no drawing; build the report first"); return captionPara; }
      const image = shot(target);
      return [...(image ? [decorated({ ...image, align: "CENTER" }, ctx)] : []), ...captionPara];
    }
    const body = element.children.filter((c) => c !== caption);
    if (body.length === 1 && body[0].name === "img") {
      const image = imageFor(body[0]);
      return [...(image ? [decorated({ ...image, align: "CENTER" }, ctx)] : []), ...captionPara];
    }
    const rest = { ...element, children: body, innerStart: element.innerStart, innerEnd: caption ? caption.start : element.innerEnd };
    return [...blocksOf(rest, ctx), ...captionPara];
  }

  function codeBlock(pre, caption, ctx) {
    if (!pre) return [];
    const code = pre.children.find((c) => c.name === "code") || pre;
    const text = childNodes(doc, code).map(function flat(node) { return node.name === "#text" ? node.text : childNodes(doc, node).map(flat).join(""); }).join("").replace(/\n+$/, "");
    const out = [];
    if (caption) out.push(decorated(para(runsOf(caption).map((r) => ({ ...r, bold: true, code: true, small: true })), { keepWithNext: true }), ctx));
    out.push(decorated(para([{ text, code: true, small: true }], { pre: true, shade: palette.sunken, border: palette.line, box: `code${pre.start}` }), ctx));
    return out;
  }

  function list(element, ctx, kind, itemRuns = null) {
    const level = ctx.list ? ctx.list.level + 1 : 0;
    const group = ctx.list ? ctx.list.group : `list${++counters.list}`;
    const topKind = ctx.list ? ctx.list.kind : kind;
    const out = [];
    for (const li of element.children.filter((c) => c.name === "li")) {
      const nested = li.children.filter((c) => c.name === "ul" || c.name === "ol");
      const own = { ...li, children: li.children.filter((c) => !nested.includes(c)), innerEnd: nested.length ? nested[0].start : li.innerEnd };
      const runs = itemRuns ? itemRuns(own) : runsOf(own);
      out.push(decorated(para(runs, { list: { kind: topKind, level, group } }), ctx));
      for (const sub of nested) out.push(...list(sub, { ...ctx, list: { kind: topKind, level, group } }, sub.name === "ol" ? "number" : "bullet"));
    }
    return out;
  }

  function sourceRuns(li) {
    const small = li.children.find((c) => c.name === "small");
    const main = { ...li, children: li.children.filter((c) => c !== small), innerEnd: small ? small.start : li.innerEnd };
    return [...runsOf(main), ...(small ? [{ text: " — ", color: palette.muted }, ...runsOf(small)] : [])];
  }

  function checklist(element, ctx) {
    const ordered = element.name === "ol";
    const out = [];
    for (const li of element.children.filter((c) => c.name === "li")) {
      const done = classes(li).includes("done");
      const small = li.children.find((c) => c.name === "small");
      const main = { ...li, children: li.children.filter((c) => c !== small), innerEnd: small ? small.start : li.innerEnd };
      const runs = [...runsOf(main), ...(small ? [{ text: " — ", color: palette.muted }, ...runsOf(small).map((r) => ({ ...r, small: false }))] : [])];
      if (ordered) out.push(decorated(para([...(done ? [{ text: "✓ ", bold: true, color: palette.ok }] : []), ...runs], { list: { kind: "number", level: 0, group: `check${element.start}` } }), ctx));
      else out.push(decorated(para([{ text: done ? "☑ " : "☐ ", color: done ? palette.ok : palette.muted }, ...runs], { indent: ctx.indent }), ctx));
    }
    return out;
  }

  function steps(element, ctx, timeline) {
    const out = [];
    const group = `steps${element.start}`;
    for (const li of element.children.filter((c) => c.name === "li")) {
      const t = toneOf(li);
      const mark = t ? [{ text: `${MARKS[t]} `, bold: true, color: tone(t) }] : [];
      const head = li.children.find((c) => c.name === "h3" || c.name === "h4");
      const time = li.children.find((c) => c.name === "time");
      const firstP = !head ? li.children.find((c) => c.name === "p" && !classes(c).includes("gate")) : null;
      const lead = head || firstP;
      const runs = [...mark];
      if (time) runs.push({ ...label(`${runsText(normalizeRuns(runsOf(time)))}`), color: palette.muted }, { text: " — " });
      if (lead) runs.push(...runsOf(lead).map((r) => (head ? { ...r, bold: true } : r)));
      out.push(decorated(para(runs, { list: { kind: timeline ? "bullet" : "number", level: 0, group } }), ctx));
      for (const child of li.children.filter((c) => c !== lead && c !== time)) out.push(...blockElement(child, { ...ctx, indent: 36, listBody: group }).map((b) => (b.type === "p" && !b.list ? { ...b, listBody: group } : b)));
    }
    return out;
  }

  function chips(element) {
    const runs = [];
    for (const li of element.children.filter((c) => c.name === "li")) {
      const t = toneOf(li);
      if (runs.length) runs.push({ text: "  " });
      const color = t ? tone(t) : palette.ink;
      runs.push({ text: " ", bg: palette.tint(t ? tone(t) : palette.muted, 0.1) }, ...runsOf(li).map((r) => ({ ...r, color: t ? color : r.color, bg: palette.tint(t ? tone(t) : palette.muted, 0.1) })), { text: " ", bg: palette.tint(t ? tone(t) : palette.muted, 0.1) });
    }
    return para(runs);
  }

  function flow(element) {
    const runs = [];
    for (const li of element.children.filter((c) => c.name === "li")) {
      if (runs.length) runs.push({ text: "  →  ", color: palette.muted });
      const t = toneOf(li);
      const small = li.children.find((c) => c.name === "small");
      const main = { ...li, children: li.children.filter((c) => c !== small), innerEnd: small ? small.start : li.innerEnd };
      runs.push(...runsOf(main).map((r) => ({ ...r, bold: true, color: t ? tone(t) : r.color })));
      if (small) runs.push({ text: " (", color: palette.muted }, ...runsOf(small).map((r) => ({ ...r, small: false, color: palette.muted })), { text: ")", color: palette.muted });
    }
    return para(runs);
  }

  // ---------- tables ----------
  const cellBlocks = (element) => {
    const produced = blocksOf(element, { cell: true }).filter((b) => b.type !== "open" && b.type !== "close" && b.type !== "table");
    return produced.length ? produced : [para([])];
  };

  function tiles(element) {
    const items = element.children.filter((c) => classes(c).includes("tile"));
    const cells = items.map((tile) => {
      const t = toneOf(tile);
      const span = tile.children.find((c) => c.name === "span");
      const value = tile.children.find((c) => c.name === "b");
      const note = tile.children.find((c) => c.name === "small");
      return {
        blocks: [
          ...(span ? [para(runsOf(span).map((r) => ({ ...r, small: true, color: palette.muted })))] : []),
          ...(value ? [para(runsOf(value).map((r) => ({ ...r, bold: true, size: 16, color: t ? tone(t) : r.color })))] : []),
          ...(note ? [para(runsOf(note).map((r) => ({ ...r, small: true, color: palette.muted })))] : []),
        ],
        bg: palette.surface,
      };
    });
    return { type: "table", rows: chunk(cells, 4), border: palette.line };
  }

  function grid(element, ctx) {
    const cls = classes(element);
    const columns = cls.includes("four") ? 4 : cls.includes("three") ? 3 : 2;
    const out = [];
    let row = [];
    const cards = element.children.filter((c) => c.name !== "#text");
    const flushRow = () => { if (row.length) out.push({ type: "table", rows: [row], border: palette.line }); row = []; };
    for (const card of cards) {
      if (classes(card).includes("wide")) { flushRow(); out.push({ type: "table", rows: [[{ blocks: cellBlocks(card) }]], border: palette.line }); continue; }
      row.push({ blocks: cellBlocks(card) });
      if (row.length === columns) { out.push({ type: "table", rows: [row], border: palette.line }); row = []; }
    }
    flushRow();
    // Consecutive rows of one grid read better as one table.
    const merged = [];
    for (const block of out) {
      const last = merged.at(-1);
      if (last && last.rows[0].length === columns && block.rows[0].length === columns) last.rows.push(...block.rows);
      else merged.push(block);
    }
    return merged.map((b) => decorated(b, ctx));
  }

  function columnsTable(columns, headerOf) {
    const header = columns.map((c) => headerOf(c));
    const rows = [];
    if (header.some(Boolean)) rows.push(header.map((h) => h || { blocks: [para([])] }));
    rows.push(columns.map((c) => ({ blocks: cellBlocks(c) })));
    return { type: "table", rows, header: header.some(Boolean), border: palette.line };
  }

  function compare(element) {
    const sides = element.children.filter((c) => classes(c).includes("before") || classes(c).includes("after"));
    const header = sides.map((side) => {
      const first = side.children[0];
      const own = first && (first.name === "h3" || first.name === "h4") ? runsOf(first) : null;
      const before = classes(side).includes("before");
      return { blocks: [para(own ? own.map((r) => ({ ...r, bold: true })) : [{ text: before ? "Before" : "After", bold: true, color: before ? palette.risk : palette.ok }])], bg: palette.sunken };
    });
    const body = sides.map((side) => {
      const first = side.children[0];
      const rest = first && (first.name === "h3" || first.name === "h4") ? { ...side, children: side.children.slice(1), innerStart: first.end } : side;
      return { blocks: cellBlocks(rest) };
    });
    return { type: "table", rows: [header, body], header: true, border: palette.line };
  }

  function options(element) {
    const opts = element.children.filter((c) => classes(c).includes("option"));
    const header = opts.map((opt) => {
      const h = opt.children.find((c) => c.name === "h3" || c.name === "h4");
      const recommended = classes(opt).includes("recommended");
      return { blocks: [para([...(h ? runsOf(h).map((r) => ({ ...r, bold: true })) : []), ...(recommended ? [{ text: "  Recommended", bold: true, small: true, color: palette.accent }] : [])])], bg: recommended ? palette.tint(palette.accent, 0.1) : palette.sunken };
    });
    const body = opts.map((opt) => {
      const h = opt.children.find((c) => c.name === "h3" || c.name === "h4");
      const rest = h ? { ...opt, children: opt.children.filter((c) => c !== h), innerStart: h.end } : opt;
      return { blocks: cellBlocks(rest), bg: classes(opt).includes("recommended") ? palette.tint(palette.accent, 0.04) : undefined };
    });
    return { type: "table", rows: [header, body], header: true, border: palette.line };
  }

  function terms(element) {
    const rows = dlPairs(element).map(([dt, dd]) => [
      { blocks: [para(runsOf(dt).map((r) => ({ ...r, bold: true })))] },
      { blocks: dd ? cellBlocks(dd) : [para([])] },
    ]);
    return { type: "table", rows, border: palette.line, widths: [150, null] };
  }

  function table(element) {
    const rows = [];
    let headerRows = 0;
    const recommended = new Set();
    const colgroup = element.children.find((c) => c.name === "colgroup");
    if (colgroup) colgroup.children.filter((c) => c.name === "col").forEach((col, i) => { if (classes(col).includes("recommended")) recommended.add(i); });
    const sections = element.children.filter((c) => ["thead", "tbody", "tfoot", "tr"].includes(c.name));
    for (const part of sections) {
      const trs = part.name === "tr" ? [part] : part.children.filter((c) => c.name === "tr");
      for (const tr of trs) {
        const cells = tr.children.filter((c) => c.name === "td" || c.name === "th");
        const isHeader = part.name === "thead" || cells.every((c) => c.name === "th");
        if (isHeader && rows.length === headerRows) headerRows++;
        const row = [];
        cells.forEach((cell, i) => {
          if (isHeader && classes(cell).includes("recommended")) recommended.add(i);
          const t = toneOf(cell);
          let produced = cellBlocks(cell);
          if (t && cell.name === "td") produced = [{ ...produced[0], runs: [{ text: `${MARKS[t]} `, bold: true, color: tone(t) }, ...(produced[0].runs || [])] }, ...produced.slice(1)];
          if (classes(cell).includes("num")) produced = produced.map((b) => (b.type === "p" ? { ...b, align: "END" } : b));
          if (isHeader) produced = produced.map((b) => (b.type === "p" ? { ...b, runs: b.runs.map((r) => ({ ...r, bold: true, color: r.color || (recommended.has(i) ? palette.accent : palette.muted) })) } : b));
          row.push({ blocks: produced, bg: isHeader ? palette.sunken : recommended.has(i) ? palette.tint(palette.accent, 0.08) : undefined });
          const span = Number(attr(cell, "colspan")) || 1;
          for (let s = 1; s < span; s++) row.push({ blocks: [para([])], bg: isHeader ? palette.sunken : undefined });
        });
        rows.push(row);
      }
    }
    const width = Math.max(1, ...rows.map((r) => r.length));
    for (const row of rows) while (row.length < width) row.push({ blocks: [para([])] });
    return { type: "table", rows: rows.length ? rows : [[{ blocks: [para([])] }]], header: headerRows > 0, headerRows, border: palette.line };
  }

  // ---------- top level ----------
  const root = doc.elements.find((e) => e.name === "body") || doc.root;
  for (const node of childNodes(doc, root)) {
    if (node.name === "#text") { if (node.text.trim()) blocks.push(para([{ text: node.text }])); continue; }
    blocks.push(...blockElement(node, {}));
  }

  const h1 = doc.elements.find((e) => e.name === "h1");
  const titleEl = doc.elements.find((e) => e.name === "title");
  const title = (h1 && runsText(normalizeRuns(runsOf(h1)))) || (titleEl && normalizeRuns([{ text: childNodes(doc, titleEl).map((n) => n.text || "").join("") }]).map((r) => r.text).join("")) || "Report";
  return { title, audience, blocks: blocks.filter(Boolean), shots, images, notes: [...new Set(notes)] };
}

function chunk(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows.length ? rows : [[{ blocks: [{ type: "p", runs: [] }] }]];
}

function describe(element) {
  const cls = classes(element);
  return cls.length ? `.${cls[0]}` : element.name;
}

// ---------- palette ----------
const hex = (value) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
};

export function mix(color, toward, amount) {
  const a = hex(color);
  const b = hex(toward);
  if (!a || !b) return color;
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * amount + ch(b, i) * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** Report colours (light scheme), with a brand kit's light colours when the report has one. */
export function makePalette(theme = null) {
  const light = theme?.light || {};
  const pick = (key, fallback) => hex(light[key]) || fallback;
  const palette = {
    accent: pick("accent", "#2155cf"),
    ink: pick("ink", "#151922"),
    muted: pick("muted", "#596273"),
    line: pick("line", "#dde1e8"),
    surface: pick("surface", "#ffffff"),
    ok: pick("ok", "#17703f"),
    warn: pick("warn", "#9a5300"),
    risk: pick("risk", "#b3261e"),
    sunken: "#eef0f4",
    mark: "#fff1a8",
  };
  palette.info = palette.accent;
  palette.tint = (color, amount) => mix(color, palette.surface, amount);
  return palette;
}
