// Allow-list serializers for editor input. Inline edits from the browser are cleaned
// (disallowed markup is unwrapped). AI rewrites are validated strictly: anything outside
// the allow-list rejects the whole proposal instead of being repaired.
import { attr, classes, decodeEntities, parse, tokenize } from "../scripts/lib/scan.mjs";
import { VOID_ELEMENTS } from "../scripts/lib/scan.mjs";
import { INLINE_TAGS } from "./blocks.mjs";

const BLOCK_TAGS = [
  "section", "article", "aside", "header", "footer", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "colgroup", "col", "figure", "figcaption", "blockquote", "details", "summary", "hr", "progress", "hr-keep"
];
const FRAGMENT_TAGS = new Set([...BLOCK_TAGS, ...INLINE_TAGS]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math", "noscript", "textarea", "select", "button", "frame", "frameset"]);
const ALWAYS_REJECT = new Set([...DROP_WITH_CONTENT, "link", "meta", "base", "form", "input", "img", "video", "audio", "source", "canvas", "dialog"]);
const GLOBAL_ATTRS = new Set(["class", "id", "title", "lang", "dir", "role"]);
const TAG_ATTRS = {
  a: ["href", "target", "rel"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"], time: ["datetime"],
  ol: ["start", "reversed", "type"], li: ["value"], progress: ["value", "max"], details: ["open"], section: ["data-toc"],
  "hr-keep": ["n"], col: ["span"], colgroup: ["span"]
};
const RESERVED_DATA = /^data-(hre|hr-ui|hr-runtime|hr-generated)$/;
// Replaced by placeholders before a fragment goes to a model, then restored verbatim.
const OPAQUE_TAGS = new Set(["pre", "svg", "math", "img", "picture", "video", "audio", "canvas", "script", "style", "iframe", "object", "embed", "template", "textarea", "select", "button", "input", "form"]);

const escapeText = (text) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export function safeHref(value) {
  const compact = value.replace(/[\u0000- \u007f]+/g, "").toLowerCase();
  return !/^(javascript|vbscript|data|file):/.test(compact);
}

function attributeAllowed(tag, attribute, original) {
  const { name, value } = attribute;
  if (name.startsWith("on") || RESERVED_DATA.test(name)) return false;
  if (original?.has(`${tag} ${name}=${value}`)) return true;
  if (name === "href") return safeHref(value);
  if (name === "style") return /^\s*--v\s*:\s*-?[0-9.]+\s*;?\s*$/.test(value);
  if (GLOBAL_ATTRS.has(name) || name.startsWith("aria-") || name.startsWith("data-")) return true;
  return (TAG_ATTRS[tag] || []).includes(name);
}

function serializeAttributes(element, mode, original) {
  let out = "";
  for (const attribute of element.attrs) {
    if (!attributeAllowed(element.name, attribute, original)) {
      if (mode === "strict") throw new Error(`disallowed attribute ${attribute.name} on <${element.name}>`);
      continue;
    }
    let value = attribute.value;
    if (attribute.name === "class") {
      value = value.split(/\s+/).filter((c) => c && !c.startsWith("hre-")).join(" ");
      if (!value) continue;
    }
    out += attribute.valueStart < 0 && attribute.name !== "class" ? ` ${attribute.name}` : ` ${attribute.name}="${escapeAttr(value)}"`;
  }
  return out;
}

function serializeChildren(doc, start, end, children, options) {
  let out = "";
  let position = start;
  const text = (from, to) => {
    for (const token of doc.tokens) {
      if (token.start >= to) break;
      if (token.end <= from || token.type !== "text") continue;
      if (token.start >= from && token.end <= to) out += escapeText(doc.source.slice(token.start, token.end));
    }
  };
  for (const child of children) {
    text(position, child.start);
    out += serializeElement(doc, child, options);
    position = child.end;
  }
  text(position, end);
  return out;
}

function serializeElement(doc, element, options) {
  const { mode, allowedTags, original } = options;
  const name = element.name;
  const allowed = allowedTags.has(name) || original?.has(`<${name}>`);
  if (!allowed || (mode === "strict" && ALWAYS_REJECT.has(name) && !original?.has(`<${name}>`))) {
    if (mode === "strict") throw new Error(`disallowed element <${name}>`);
    if (DROP_WITH_CONTENT.has(name) || attr(element, "data-hr-ui") !== null) return "";
    return serializeChildren(doc, element.innerStart, element.innerEnd, element.children, options);
  }
  if (attr(element, "data-hr-ui") !== null) {
    if (mode === "strict") throw new Error("editor UI markup in fragment");
    return "";
  }
  const open = `<${name}${serializeAttributes(element, mode, original)}>`;
  if (VOID_ELEMENTS.has(name)) return open;
  return `${open}${serializeChildren(doc, element.innerStart, element.innerEnd, element.children, options)}</${name}>`;
}

/**
 * Clean the innerHTML of an inline edit. Only inline tags that already appeared in the
 * original block (plus <br>) survive; everything else is unwrapped to its text.
 */
export function sanitizeInline(html, originalInner = "") {
  const originalTags = new Set(parse(originalInner).elements.map((e) => e.name));
  const allowedTags = new Set([...INLINE_TAGS].filter((tag) => tag === "br" || originalTags.has(tag)));
  const doc = parse(html);
  return serializeChildren(doc, 0, html.length, doc.root.children, { mode: "clean", allowedTags, original: inventory(originalInner) });
}

/** Tags and attribute pairs present in original source, which a rewrite may keep. */
function inventory(html) {
  const found = new Set();
  for (const element of parse(html).elements) {
    if (!ALWAYS_REJECT.has(element.name)) found.add(`<${element.name}>`);
    for (const attribute of element.attrs) {
      if (!attribute.name.startsWith("on") && !(attribute.name === "href" && !safeHref(attribute.value))) found.add(`${element.name} ${attribute.name}=${attribute.value}`);
    }
  }
  return found;
}

/** Swap opaque subtrees (images, code, diagrams, mockups) for numbered placeholders. */
export function protect(outerHtml) {
  const doc = parse(outerHtml);
  const kept = new Map();
  const edits = [];
  const visit = (element) => {
    for (const child of element.children) {
      if (OPAQUE_TAGS.has(child.name) || classes(child).includes("device") || attr(child, "data-hr-generated") !== null) {
        const n = kept.size + 1;
        kept.set(String(n), outerHtml.slice(child.start, child.end));
        edits.push({ start: child.start, end: child.end, text: `<hr-keep n="${n}"></hr-keep>` });
      } else visit(child);
    }
  };
  visit(doc.root);
  let html = outerHtml;
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
  return { html, kept };
}

export function restore(html, kept) {
  const seen = new Map();
  const out = html.replace(/<hr-keep\s+n=["']?(\d+)["']?\s*\/?>(?:\s*<\/hr-keep>)?/gi, (match, n) => {
    seen.set(n, (seen.get(n) || 0) + 1);
    if (!kept.has(n)) throw new Error(`the model invented protected content #${n}`);
    return kept.get(n);
  });
  for (const n of kept.keys()) {
    if (seen.get(n) !== 1) throw new Error(`the model ${seen.get(n) ? "duplicated" : "dropped"} protected content #${n} (an image, code block, diagram, or mockup)`);
  }
  return out;
}

/**
 * Validate and normalize a model's rewrite of `originalOuter` (both with placeholders).
 * Returns normalized HTML; throws with a reader-facing reason when the proposal is unsafe.
 */
export function validateRewrite(candidate, originalOuter) {
  let html = String(candidate || "").trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "");
  const doc = parse(html);
  const roots = doc.root.children;
  const strayText = doc.tokens.some((t) => t.type === "text" && t.start >= 0 && !roots.some((r) => t.start >= r.start && t.end <= r.end) && t.end <= html.length && html.slice(t.start, t.end).trim());
  if (roots.length !== 1 || strayText) throw new Error("the rewrite must be exactly one element");
  const original = parse(originalOuter).root.children[0];
  const root = roots[0];
  if (root.name !== original.name) throw new Error(`the rewrite changed <${original.name}> into <${root.name}>`);
  if ((attr(root, "id") || "") !== (attr(original, "id") || "")) throw new Error("the rewrite changed the element's id");
  const unclean = doc.elements.find((e) => !e.clean);
  if (unclean) throw new Error(`unbalanced markup near <${unclean.name}>`);
  const originalIds = parse(originalOuter).elements.map((e) => attr(e, "id")).filter(Boolean);
  const ids = new Set(doc.elements.map((e) => attr(e, "id")).filter(Boolean));
  const missing = originalIds.filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`the rewrite removed id(s) ${missing.join(", ")}, which links depend on`);
  html = serializeChildren(doc, 0, html.length, doc.root.children, { mode: "strict", allowedTags: FRAGMENT_TAGS, original: inventory(originalOuter) });
  return html;
}

/** Visible text of an HTML fragment with spaces at block boundaries, for diffs. */
export function readableText(html) {
  let text = "";
  for (const token of tokenize(html)) {
    if (token.type === "text" && !token.raw) text += decodeEntities(html.slice(token.start, token.end));
    else if ((token.type === "open" || token.type === "close") && !INLINE_TAGS.has(token.name)) text += " ";
    else if (token.type === "open" && token.name === "br") text += " ";
  }
  return text.replace(/[\u00a0\s]+/g, " ").trim();
}

/** Word-level diff: [{op: "=" | "-" | "+", text}] with adjacent ops merged. */
export function wordDiff(before, after) {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length * b.length > 4_000_000) return [{ op: "-", text: a.join(" ") }, { op: "+", text: b.join(" ") }].filter((s) => s.text);
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = a[i] === b[j] ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
    }
  }
  const segments = [];
  const push = (op, word) => {
    const last = segments[segments.length - 1];
    if (last && last.op === op) last.text += ` ${word}`;
    else segments.push({ op, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("=", a[i]); i++; j++; }
    else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) push("-", a[i++]);
    else push("+", b[j++]);
  }
  while (i < n) push("-", a[i++]);
  while (j < m) push("+", b[j++]);
  return segments;
}

export const ALLOWED_FRAGMENT_TAGS = [...FRAGMENT_TAGS].filter((t) => t !== "hr-keep").sort();
