// Map a report's source to editable blocks (b1, b2, ...) and AI scopes (c1, c2, ...).
// Ids are ordinals recomputed from the current source on every request, injected only into
// the served copy, and never written to the file.
import { ancestors, attr, classes, decodeEntities, escapeHtml, normalizeText, parse, splice, textContent } from "../scripts/lib/scan.mjs";

const BLOCK_TAGS = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "dt", "dd", "figcaption", "summary", "caption", "blockquote"]);
const SCOPE_TAGS = new Set(["section", "article", "aside", "header", "footer", "div", "ul", "ol", "dl", "table", "figure", "details", "blockquote", "li"]);
export const INLINE_TAGS = new Set(["a", "abbr", "b", "br", "cite", "code", "del", "em", "i", "ins", "kbd", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "wbr"]);
const OPAQUE_TAGS = new Set(["pre", "svg", "math", "script", "style", "textarea", "template", "noscript", "head", "button", "select", "iframe", "object", "video", "audio", "canvas"]);

function isOpaque(element) {
  if (OPAQUE_TAGS.has(element.name)) return true;
  if (attr(element, "data-hr-runtime") !== null || attr(element, "data-hr-generated") !== null || attr(element, "data-hr-ui") !== null) return true;
  return classes(element).includes("device");
}

function phrasingOnly(element) {
  return element.children.every((child) => INLINE_TAGS.has(child.name) && phrasingOnly(child));
}

/** All editable blocks and AI scopes in document order, with stable ordinal ids. */
export function indexBlocks(doc) {
  const blocks = [];
  const scopes = [];
  const body = doc.elements.find((e) => e.name === "body") || doc.root;
  const visit = (element) => {
    for (const child of element.children) {
      if (isOpaque(child) || child.foreign) continue;
      const isAnswer = classes(child).includes("answer");
      const textDiv = child.name === "div" && child.children.length > 0;
      if ((BLOCK_TAGS.has(child.name) || isAnswer || textDiv) && child.clean && child.close && phrasingOnly(child)) {
        // Empty blocks stay indexed so ordinals do not shift when an edit clears a block.
        blocks.push({ id: `b${blocks.length + 1}`, element: child, kind: "block" });
        continue;
      }
      if (SCOPE_TAGS.has(child.name) && child.clean && child.close && child.children.length > 0) {
        scopes.push({ id: `c${scopes.length + 1}`, element: child, kind: "scope" });
      }
      visit(child);
    }
  };
  visit(body);
  return { blocks, scopes, byId: new Map([...blocks, ...scopes].map((entry) => [entry.id, entry])) };
}

/** The served copy: data-hre ids on blocks and scopes plus the injected editor assets. */
export function instrument(source, { headHtml = "", bodyHtml = "" } = {}) {
  const doc = parse(source);
  const { blocks, scopes } = indexBlocks(doc);
  const edits = [...blocks, ...scopes].map(({ id, element }) => {
    const at = element.open.start + 1 + element.name.length;
    return { start: at, end: at, text: ` data-hre="${id}"` };
  });
  const head = doc.elements.find((e) => e.name === "head");
  const body = doc.elements.find((e) => e.name === "body");
  // Without an explicit </head> or </body>, append at the end: injecting before the doctype
  // would switch the page into quirks mode.
  const end = body && body.close ? body.innerEnd : source.length;
  if (head && head.close) {
    edits.push({ start: head.innerEnd, end: head.innerEnd, text: headHtml });
    edits.push({ start: end, end, text: bodyHtml });
  } else {
    edits.push({ start: end, end, text: headHtml + bodyHtml });
  }
  return splice(source, edits);
}

export function locate(source, id) {
  const doc = parse(source);
  const index = indexBlocks(doc);
  const entry = index.byId.get(id);
  return entry ? { doc, ...entry } : null;
}

/** Replace a block's inner content; returns the new source. */
export function replaceInner(source, element, html) {
  return splice(source, [{ start: element.innerStart, end: element.innerEnd, text: html }]);
}

/** Replace a whole element (outer range); returns the new source. */
export function replaceOuter(source, element, html) {
  return splice(source, [{ start: element.start, end: element.end, text: html }]);
}

/** Text around an element for AI context: the closest preceding and following prose. */
export function surroundingText(doc, element, limit = 500) {
  const main = doc.elements.find((e) => e.name === "main") || doc.elements.find((e) => e.name === "body") || doc.root;
  const before = normalizeText(textOfRange(doc, main.innerStart, element.start));
  const after = normalizeText(textOfRange(doc, element.end, main.innerEnd));
  return { before: before.slice(-limit), after: after.slice(0, limit) };
}

function textOfRange(doc, start, end) {
  const skipped = doc.elements
    .filter((e) => e.start >= start && e.end <= end && (attr(e, "data-hr-generated") !== null || attr(e, "data-hr-ui") !== null))
    .map((e) => [e.start, e.end]);
  let text = "";
  for (const token of doc.tokens) {
    if (token.type !== "text" || token.raw || token.start < start || token.end > end) continue;
    if (skipped.some(([s, e]) => token.start >= s && token.end <= e)) continue;
    text += `${decodeEntities(doc.source.slice(token.start, token.end))} `;
  }
  return text;
}

/** Section headings for prompt context. */
export function outlineHeadings(doc) {
  return doc.elements
    .filter((e) => /^h[1-3]$/.test(e.name) && !ancestors(e).some((a) => attr(a, "data-hr-generated") !== null))
    .map((e) => `${"  ".repeat(Number(e.name[1]) - 1)}${normalizeText(textContent(doc, e))}`)
    .filter((line) => line.trim())
    .slice(0, 80)
    .join("\n");
}

export function describe(entry, doc) {
  const element = entry.element;
  const id = attr(element, "id");
  const label = [element.name, id ? `#${id}` : "", ...classes(element).map((c) => `.${c}`)].join("");
  return { id: entry.id, kind: entry.kind, label: escapeHtml(label), text: normalizeText(textContent(doc, element)).slice(0, 120) };
}
