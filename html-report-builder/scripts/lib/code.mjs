// Syntax highlighting at build time. A code block is <pre><code class="language-sql">; the build
// colours it with the pinned highlight.js (run in Node, no browser) and writes the coloured spans
// into the file, so reports need no script to show them. The <code> element records the hash of
// its language and plain text in data-hr-highlight and the language's display name in data-lang;
// later builds recolour a block only when its text or language changes. Editing the text inside
// the spans is safe: the next build reads the plain text back and colours it again.
import { createHash } from "node:crypto";
import vm from "node:vm";
import { attr, classes, escapeHtml, parse, splice, textContent } from "./scan.mjs";
import { LIBRARIES } from "./vendor.mjs";

export const CODE_THEME_VERSION = "code-1";
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
// Languages a block can name that mean "do not colour": the block still gets its label.
const PLAIN = new Set(["text", "plain", "plaintext", "txt", "none", "output", "console-output"]);

/** The language a <code> element names through a language-* (or lang-*) class, lower-cased. */
export function codeLanguage(element) {
  for (const name of classes(element)) {
    const match = /^(?:language|lang)-(.+)$/.exec(name);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** Every <pre><code class="language-*"> block with its language, plain text, and hash. */
export function codeBlocksIn(source, doc = parse(source)) {
  return doc.elements.filter((e) => e.name === "code" && e.parent && e.parent.name === "pre" && codeLanguage(e)).map((code) => {
    const language = codeLanguage(code);
    const text = textContent(doc, code);
    return { code, language, text, hash: hash(`${CODE_THEME_VERSION}\n${LIBRARIES.highlight.version}\n${language}\n${text}`) };
  });
}

/** Blocks the build has not coloured yet, or whose text or language changed since. */
export const staleCodeBlocks = (blocks, force = false) => blocks.filter((b) => force || attr(b.code, "data-hr-highlight") !== b.hash);

/** Load highlight.js's browser bundle into a Node sandbox and return its hljs object. */
export function loadHighlighter(libraryText) {
  const module = { exports: {} };
  const context = { module, exports: module.exports };
  vm.createContext(context);
  vm.runInContext(libraryText, context);
  const hljs = module.exports && module.exports.highlight ? module.exports : context.hljs;
  if (!hljs || typeof hljs.highlight !== "function") throw new Error("the highlight.js bundle did not load");
  hljs.configure({ ignoreUnescapedHTML: true, throwUnescapedHTML: false });
  return hljs;
}

/** The label a reader sees for a language: "HTML" rather than "HTML, XML". */
function displayName(hljs, language) {
  if (PLAIN.has(language)) return "Text";
  const found = hljs && hljs.getLanguage(language);
  return found ? String(found.name).split(",")[0].trim() : language;
}

/** The <code> opening tag with data-hr-highlight and data-lang set, keeping every other attribute. */
function openingTag(source, code, { hash: digest, label }) {
  const kept = code.attrs.filter((a) => a.name !== "data-hr-highlight" && a.name !== "data-lang").map((a) => source.slice(a.start, a.valueEnd === -1 ? a.end : a.valueEnd + (a.quote ? 1 : 0)));
  return `<code ${[...kept, `data-lang="${escapeHtml(label)}"`, `data-hr-highlight="${digest}"`].join(" ")}>`;
}

/**
 * Colour stale code blocks. `hljs` is the loaded highlighter, or null when it is unavailable, in
 * which case nothing changes and a note says why. Returns {source, notes, highlighted, blocks}.
 */
export function highlightCode(source, { hljs, force = false } = {}) {
  const doc = parse(source);
  const blocks = codeBlocksIn(source, doc);
  const stale = staleCodeBlocks(blocks, force);
  const notes = [];
  if (!stale.length) return { source, notes, highlighted: 0, blocks: blocks.length };
  if (!hljs) return { source, notes: ["code blocks were not coloured: highlight.js is not available"], highlighted: 0, blocks: blocks.length };
  const unknown = new Set();
  const edits = [];
  for (const block of stale) {
    let html;
    if (PLAIN.has(block.language)) html = escapeHtml(block.text).replace(/&quot;/g, '"');
    else if (hljs.getLanguage(block.language)) html = hljs.highlight(block.text, { language: block.language, ignoreIllegals: true }).value;
    else {
      unknown.add(block.language);
      html = escapeHtml(block.text).replace(/&quot;/g, '"');
    }
    const label = displayName(hljs, block.language);
    edits.push({ start: block.code.start, end: block.code.innerEnd, text: openingTag(source, block.code, { hash: block.hash, label }) + html });
  }
  if (unknown.size) notes.push(`no highlighting for language ${[...unknown].map((l) => `"${l}"`).join(", ")}; supported: ${hljs.listLanguages().join(", ")}`);
  return { source: splice(source, edits), notes, highlighted: stale.length, blocks: blocks.length };
}
