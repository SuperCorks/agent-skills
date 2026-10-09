import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { attr, classes, escapeHtml, normalizeText, parse, splice, textContent } from "./scan.mjs";
import { stripComments } from "./comments.mjs";
import { RUNTIME_VERSION, loadRuntime } from "./runtime.mjs";

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

/**
 * Build in place: refresh the marked runtime blocks and TOC, and inline local images.
 * Authored bytes outside those edits are never touched, so building twice is a no-op.
 */
export function buildSource(source, { file, inlineImages = true } = {}) {
  const doc = parse(source);
  const edits = [];
  const notes = [];
  const find = (predicate) => doc.elements.find(predicate);
  const head = find((e) => e.name === "head");
  const body = find((e) => e.name === "body");
  const main = find((e) => e.name === "main");
  const html = find((e) => e.name === "html");
  const runtime = loadRuntime(html ? attr(html, "data-template") : null);

  const styleLine = `<style data-hr-runtime="${RUNTIME_VERSION}">${runtime.css}</style>`;
  const scriptLine = `<script data-hr-runtime="${RUNTIME_VERSION}">${runtime.js}</script>`;
  const style = find((e) => e.name === "style" && attr(e, "data-hr-runtime") !== null);
  const script = find((e) => e.name === "script" && attr(e, "data-hr-runtime") !== null);
  const nav = find((e) => e.name === "nav" && attr(e, "data-hr-generated") === "toc");

  if (style) edits.push({ start: style.start, end: style.end, text: styleLine });
  else if (head && head.close) edits.push(insertLineBefore(source, head.innerEnd, styleLine));
  else notes.push("no explicit </head>; runtime CSS not inserted");

  if (script) edits.push({ start: script.start, end: script.end, text: scriptLine });
  else if (body && body.close) edits.push(insertLineBefore(source, body.innerEnd, scriptLine));
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
  return { output, changed: output !== source, notes };
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

