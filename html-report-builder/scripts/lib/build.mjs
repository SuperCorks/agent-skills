import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ancestors, attr, classes, escapeHtml, normalizeText, parse, splice, textContent, visibleTextContent } from "./scan.mjs";
import { STORE_ATTR, stripComments } from "./comments.mjs";
import { libraryTag, readLibrary } from "./vendor.mjs";
import { RUNTIME_VERSION, TEMPLATES, loadRuntime } from "./runtime.mjs";
import { BRAND_ATTR, BRAND_LOGO, brandLogoTag, brandStyleTag } from "./brand.mjs";

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml"
};
const EXTENSION = { ...Object.fromEntries(Object.entries(MIME).map(([ext, mime]) => [mime, ext])), "image/jpeg": ".jpg" };

export function isLocalReference(value) {
  if (!value) return false;
  const trimmed = value.trim();
  return !!trimmed && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed);
}

function quoteAttribute(value) {
  return `"${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
}

function attrNode(element, name) {
  return element.attrs.find((a) => a.name === name);
}

/** Edit that replaces an attribute's value (or adds it after the tag name when absent). */
export function setAttributeEdit(source, element, name, value) {
  const existing = attrNode(element, name);
  if (existing && existing.valueStart >= 0) {
    if (existing.quote) return { start: existing.valueStart, end: existing.valueEnd, text: value.replace(/&/g, "&amp;").replace(new RegExp(existing.quote, "g"), existing.quote === '"' ? "&quot;" : "&#39;") };
    return { start: existing.start, end: existing.end, text: `${name}=${quoteAttribute(value)}` };
  }
  if (existing) return { start: existing.start, end: existing.end, text: `${name}=${quoteAttribute(value)}` };
  const nameEnd = element.open.start + 1 + element.name.length;
  return { start: nameEnd, end: nameEnd, text: ` ${name}=${quoteAttribute(value)}` };
}

/**
 * Edits that give an element these attributes: changed values through setAttributeEdit, missing
 * ones appended together at the end of the open tag, in order. A value of "" writes a bare name.
 */
export function setAttributesEdits(source, element, entries) {
  const edits = [];
  let added = "";
  for (const [name, value] of entries) {
    if (!attrNode(element, name)) added += value === "" ? ` ${name}` : ` ${name}=${quoteAttribute(value)}`;
    else if (attr(element, name) !== value) edits.push(setAttributeEdit(source, element, name, value));
  }
  if (!added) return edits;
  const { open } = element;
  let at = source[open.end - 1] === ">" ? open.end - 1 : -1;
  if (at > 0 && source[at - 1] === "/") at--;
  while (at > open.start && /\s/.test(source[at - 1])) at--;
  if (at < 0) at = open.start + 1 + element.name.length;
  edits.push({ start: at, end: at, text: added });
  return edits;
}

export function removeAttributeEdit(source, element, name) {
  const existing = attrNode(element, name);
  if (!existing) return null;
  let start = existing.start;
  while (start > element.open.start && /\s/.test(source[start - 1])) start--;
  return { start, end: existing.end, text: "" };
}

/** Insert a whole line before the line that holds `offset` when only indentation precedes it. */
function insertLineBefore(source, offset, line) {
  let lineStart = offset;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") lineStart--;
  if (/^[ \t]*$/.test(source.slice(lineStart, offset))) return { start: lineStart, end: lineStart, text: `${line}\n` };
  return { start: offset, end: offset, text: `\n${line}\n` };
}

export function dataUri(file) {
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

export function decodeDataUri(uri) {
  const match = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;
  const mime = (match[1] || "text/plain").toLowerCase();
  const bytes = match[3] ? Buffer.from(match[4], "base64") : Buffer.from(decodeURIComponent(match[4]), "utf8");
  return { mime, bytes, extension: EXTENSION[mime] || ".bin" };
}

/** Sections that become TOC entries: section[id] inside <main> with a direct <h2>. */
export function tocSections(doc) {
  const main = doc.elements.find((e) => e.name === "main");
  if (!main) return [];
  const result = [];
  const visit = (element) => {
    for (const child of element.children) {
      if (child.name === "section" && attr(child, "id")) {
        const heading = child.children.find((c) => c.name === "h2") || (classes(child).includes("slide") ? child.children.find((c) => c.name === "h1") : null);
        if (heading) {
          result.push({ id: attr(child, "id"), label: attr(child, "data-toc") || normalizeText(textContent(doc, heading)), element: child, heading });
          continue;
        }
      }
      if (child.name !== "section") visit(child);
    }
  };
  visit(main);
  return result;
}

export function renderToc(doc) {
  const sections = tocSections(doc);
  if (!sections.length) return "";
  const links = sections.map((s) => `<a href="#${escapeHtml(s.id)}">${escapeHtml(s.label)}</a>`).join("");
  return `<nav class="toc" data-hr-generated="toc" aria-label="Contents">${links}</nav>`;
}

const SLUG_MAX = 40;

/** A heading's words as a lowercase hyphenated id, cut at a word within SLUG_MAX characters. */
function slugify(text) {
  const words = String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  return slug || (words[0] || "").slice(0, SLUG_MAX);
}

/** The slides of a deck, as deck.js finds them: `.slide` children of `main.deck` (or `main`). */
function deckSlides(doc) {
  const main = doc.elements.find((e) => e.name === "main" && classes(e).includes("deck")) || doc.elements.find((e) => e.name === "main");
  return main ? main.children.filter((c) => classes(c).includes("slide")) : [];
}

/**
 * Kernel's document contract (https://app.krnl.work/api/document-contract.md), written into the
 * source: the kind and contract version on <html>, data-kernel-slide on a deck's slides,
 * data-kernel-question on question cards and data-kernel-answer on their direct `.answer` slot,
 * and an id on every section, slide, figure, and question card without one. A new id comes from
 * the block's first heading (a figure's caption), else its kind and position, de-duplicated
 * against every id in the document. Ids already written are never changed, so they outlast
 * heading edits and later builds.
 */
function contractEdits(source, doc, { deck }) {
  const edits = [];
  const html = doc.elements.find((e) => e.name === "html");
  if (html) edits.push(...setAttributesEdits(source, html, [["data-kernel-kind", deck ? "deck" : "report"], ["data-kernel-contract", "1"]]));
  const slides = new Set(deck ? deckSlides(doc) : []);
  const skipped = (element) => element.foreign || ancestors(element).some((a) => a.name === "template" || attr(a, "data-hr-generated") !== null || attr(a, STORE_ATTR) !== null || classes(a).includes("device"));
  const kindOf = (element) => {
    if (classes(element).includes("question") || attr(element, "data-kernel-question") !== null) return "question";
    if (element.name === "section") return slides.has(element) ? "slide" : "section";
    return element.name === "figure" ? "figure" : null;
  };
  const blocks = new Map();
  for (const element of doc.elements) {
    const kind = kindOf(element);
    if (kind && !skipped(element)) blocks.set(element, kind);
  }
  // Each block's title: its first heading that no nested block owns.
  const headings = new Map();
  for (const element of doc.elements) {
    if (!/^h[1-6]$/.test(element.name) || skipped(element)) continue;
    const owner = ancestors(element).find((a) => blocks.has(a));
    if (owner && !headings.has(owner)) headings.set(owner, element);
  }
  const taken = new Set(doc.elements.map((e) => attr(e, "id")).filter(Boolean));
  const unique = (base) => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };
  const positions = {};
  for (const [element, kind] of blocks) {
    positions[kind] = (positions[kind] || 0) + 1;
    const entries = [];
    if (!(attr(element, "id") || "").trim()) {
      const caption = kind === "figure" ? element.children.find((c) => c.name === "figcaption") : null;
      const title = caption || headings.get(element);
      let slug = title ? slugify(normalizeText(visibleTextContent(doc, title))) : "";
      if (/^\d/.test(slug)) slug = `${kind}-${slug}`;
      entries.push(["id", unique(slug || `${kind}-${positions[kind]}`)]);
    }
    if (kind === "slide" && attr(element, "data-kernel-slide") === null) entries.push(["data-kernel-slide", ""]);
    if (kind === "question") {
      if (attr(element, "data-kernel-question") === null) entries.push(["data-kernel-question", ""]);
      const answer = element.children.find((c) => classes(c).includes("answer"));
      if (answer && !element.children.some((c) => attr(c, "data-kernel-answer") !== null)) edits.push(...setAttributesEdits(source, answer, [["data-kernel-answer", ""]]));
    }
    edits.push(...setAttributesEdits(source, element, entries));
  }
  return edits;
}

/** Where the brand logo goes: a deck's cover slide, else the report's hero. */
function logoHost(doc, deck) {
  return (deck ? deckSlides(doc).find((s) => classes(s).includes("cover")) : doc.elements.find((e) => classes(e).includes("hero") && !e.foreign)) || null;
}

/**
 * Brand edits for `brand` (a parsed Kernel bundle; null removes the brand, undefined keeps
 * whatever the file has): one <style data-kernel-brand> right after the runtime style, and the
 * logo block as the first child of the hero or cover. Returns the edits and, when the brand style
 * is new, the line to put after the runtime style.
 */
function brandEdits(source, doc, brand, { deck, notes }) {
  const edits = [];
  const styles = doc.elements.filter((e) => e.name === "style" && attr(e, BRAND_ATTR) !== null);
  const logos = doc.elements.filter((e) => attr(e, "data-hr-generated") === BRAND_LOGO);
  if (brand === undefined) return { edits, styleLine: null };
  if (brand === null) {
    for (const element of [...styles, ...logos]) edits.push(removeLine(source, element));
    return { edits, styleLine: null };
  }
  const styleLine = brandStyleTag(brand);
  styles.forEach((style, index) => {
    if (index) edits.push(removeLine(source, style));
    else if (source.slice(style.start, style.end) !== styleLine) edits.push({ start: style.start, end: style.end, text: styleLine });
  });
  const logoLine = brandLogoTag(brand);
  const host = logoLine ? logoHost(doc, deck) : null;
  if (logoLine && !host) notes.push(`the brand logo goes in the ${deck ? "cover slide (<section class=\"slide cover\">)" : "hero (<header class=\"hero\">)"}, which this ${deck ? "deck" : "report"} does not have`);
  const kept = host ? logos.find((logo) => logo.parent === host) : null;
  for (const logo of logos) {
    if (logo !== kept) edits.push(removeLine(source, logo));
    else if (source.slice(logo.start, logo.end) !== logoLine) edits.push({ start: logo.start, end: logo.end, text: logoLine });
  }
  if (host && !kept) {
    const first = host.children.find((c) => !logos.includes(c));
    edits.push(first ? insertLineBefore(source, first.start, logoLine) : { start: host.innerStart, end: host.innerStart, text: logoLine });
  }
  return { edits, styleLine: styles.length ? null : styleLine };
}

/**
 * Build in place: write Kernel's document contract into the source, refresh the marked runtime
 * blocks and TOC, apply a Kernel brand kit when given one (`brand`: a parsed bundle, or null to
 * remove the brand; left out, the file keeps its brand), and inline local images. Authored bytes
 * outside those edits are never touched, so building twice is a no-op.
 */
export function buildSource(original, { file, inlineImages = true, brand } = {}) {
  const authored = parse(original);
  const root = authored.elements.find((e) => e.name === "html");
  const deck = Boolean(TEMPLATES[root ? attr(root, "data-template") : null]?.deck);
  const marks = contractEdits(original, authored, { deck });
  // The rest of the build reads the marked source, so new ids reach the TOC in the same build.
  const source = marks.length ? splice(original, marks) : original;
  const doc = marks.length ? parse(source) : authored;
  const edits = [];
  const notes = [];
  const find = (predicate) => doc.elements.find(predicate);
  const head = find((e) => e.name === "head");
  const body = find((e) => e.name === "body");
  const main = find((e) => e.name === "main");
  const html = find((e) => e.name === "html");
  const charted = doc.elements.some((e) => e.name === "script" && attr(e, "data-hr-chart") !== null);
  const runtime = loadRuntime(html ? attr(html, "data-template") : null, { charts: charted });

  const styleLine = `<style data-hr-runtime="${RUNTIME_VERSION}">${runtime.css}</style>`;
  const scriptLine = `<script data-hr-runtime="${RUNTIME_VERSION}">${runtime.js}</script>`;
  const style = find((e) => e.name === "style" && attr(e, "data-hr-runtime") !== null);
  const script = find((e) => e.name === "script" && attr(e, "data-hr-runtime") !== null && attr(e, "data-hr-runtime") !== "plotly");
  const plotlyScript = find((e) => e.name === "script" && attr(e, "data-hr-runtime") === "plotly");
  // Plotly (pinned, hash-checked) goes in only while the report has charts, just before the runtime.
  const plotly = charted ? readLibrary("plotly") : null;
  const plotlyLine = plotly ? `<script data-hr-runtime="plotly" data-hr-lib="${libraryTag("plotly")}">${plotly.replace(/<\/script/gi, "<\\/script")}</script>` : null;
  if (charted && !plotly && !plotlyScript) notes.push("charts are not interactive yet: run `report.mjs build` once with internet to download Plotly");
  if (plotlyScript && plotlyLine && source.slice(plotlyScript.start, plotlyScript.end) !== plotlyLine) edits.push({ start: plotlyScript.start, end: plotlyScript.end, text: plotlyLine });
  if (plotlyScript && !charted) edits.push(removeLine(source, plotlyScript));
  const addPlotly = plotlyLine && !plotlyScript;
  const nav = find((e) => e.name === "nav" && attr(e, "data-hr-generated") === "toc");

  const branded = brandEdits(source, doc, brand, { deck, notes });
  edits.push(...branded.edits);
  // A new brand style goes right after the runtime style, so the kit's own CSS wins over it.
  const styleLines = branded.styleLine ? `${styleLine}\n${branded.styleLine}` : styleLine;
  if (style) edits.push({ start: style.start, end: style.end, text: styleLines });
  else if (head && head.close) edits.push(insertLineBefore(source, head.innerEnd, styleLines));
  else notes.push("no explicit </head>; runtime CSS not inserted");

  if (script) edits.push({ start: script.start, end: script.end, text: addPlotly ? `${plotlyLine}\n${scriptLine}` : scriptLine });
  else if (body && body.close) edits.push(insertLineBefore(source, body.innerEnd, addPlotly ? `${plotlyLine}\n${scriptLine}` : scriptLine));
  else notes.push("no explicit </body>; runtime script not inserted");

  const tocOff = html && attr(html, "data-toc") === "off";
  const toc = tocOff ? "" : renderToc(doc);
  if (nav) edits.push(toc ? { start: nav.start, end: nav.end, text: toc } : removeLine(source, nav));
  else if (toc && main) edits.push(insertLineBefore(source, main.start, toc));

  if (inlineImages && file) {
    const baseDir = path.dirname(path.resolve(file));
    for (const image of doc.elements.filter((e) => e.name === "img")) {
      const src = attr(image, "src");
      const original = attr(image, "data-hr-src");
      const reference = original || (isLocalReference(src) ? src : null);
      if (!reference || !isLocalReference(reference)) continue;
      const target = path.resolve(baseDir, decodeURI(reference.split(/[?#]/)[0]));
      if (!existsSync(target)) {
        if (!original) notes.push(`image not found: ${reference}`);
        continue;
      }
      const uri = dataUri(target);
      if (!uri) { notes.push(`unsupported image type: ${reference}`); continue; }
      if (uri !== src) edits.push(setAttributeEdit(source, image, "src", uri));
      if (!original) {
        const srcNode = attrNode(image, "src");
        edits.push({ start: srcNode.end, end: srcNode.end, text: ` data-hr-src=${quoteAttribute(reference)}` });
      }
    }
  }
  const output = splice(source, edits);
  return { output, changed: output !== original, notes };
}

/** Regenerate only an existing generated TOC (used by the editor after a heading edit). */
export function refreshToc(source) {
  const doc = parse(source);
  const nav = doc.elements.find((e) => e.name === "nav" && attr(e, "data-hr-generated") === "toc");
  if (!nav) return source;
  const toc = renderToc(doc);
  return splice(source, [toc ? { start: nav.start, end: nav.end, text: toc } : removeLine(source, nav)]);
}

function removeLine(source, element) {
  let start = element.start;
  let end = element.end;
  while (start > 0 && (source[start - 1] === " " || source[start - 1] === "\t")) start--;
  if (source[end] === "\n" && (start === 0 || source[start - 1] === "\n")) end++;
  return { start, end, text: "" };
}

export function buildFile(file, options = {}) {
  const source = readFileSync(file, "utf8");
  const result = buildSource(source, { ...options, file });
  if (result.changed) writeFileSync(file, result.output);
  return result;
}

/**
 * Write a publish copy for Kernel or publish-artifacts: images become relative files in
 * `<slug>.assets/` next to `<slug>.html` instead of inlined data URIs.
 */
export function exportFile(file, outDir) {
  const source = readFileSync(file, "utf8");
  const doc = parse(source);
  const slug = path.basename(file).replace(/\.html?$/i, "");
  const assetsName = `${slug}.assets`;
  const assetsDir = path.join(outDir, assetsName);
  const baseDir = path.dirname(path.resolve(file));
  const edits = [];
  const written = new Map();
  const assets = [];
  const store = (bytes, preferredName) => {
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    if (written.has(hash)) return written.get(hash);
    let name = preferredName.replace(/[^\w.-]+/g, "-");
    const taken = new Set(written.values());
    if (taken.has(`${assetsName}/${name}`)) name = `${path.basename(name, path.extname(name))}-${hash}${path.extname(name)}`;
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(path.join(assetsDir, name), bytes);
    const relative = `${assetsName}/${name}`;
    written.set(hash, relative);
    assets.push(relative);
    return relative;
  };
  for (const image of doc.elements.filter((e) => e.name === "img")) {
    const src = attr(image, "src") || "";
    const original = attr(image, "data-hr-src");
    let relative = null;
    const originalPath = original && isLocalReference(original) ? path.resolve(baseDir, decodeURI(original.split(/[?#]/)[0])) : null;
    if (originalPath && existsSync(originalPath)) relative = store(readFileSync(originalPath), path.basename(originalPath));
    else if (src.startsWith("data:")) {
      const decoded = decodeDataUri(src);
      if (decoded) {
        const hash = createHash("sha256").update(decoded.bytes).digest("hex").slice(0, 10);
        relative = store(decoded.bytes, original ? path.basename(original) : `image-${hash}${decoded.extension}`);
      }
    } else if (isLocalReference(src)) {
      const target = path.resolve(baseDir, decodeURI(src.split(/[?#]/)[0]));
      if (existsSync(target)) relative = store(readFileSync(target), path.basename(target));
    }
    if (!relative) continue;
    edits.push(setAttributeEdit(source, image, "src", relative));
    const removal = removeAttributeEdit(source, image, "data-hr-src");
    if (removal) edits.push(removal);
  }
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}.html`);
  if (path.resolve(outFile) === path.resolve(file)) throw new Error("export --out must differ from the report's own folder");
  writeFileSync(outFile, stripComments(splice(source, edits)));
  return { file: outFile, assets };
}

