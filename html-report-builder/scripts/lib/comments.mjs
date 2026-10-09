// Review comments pinned to parts of a report. They live in the report file itself so they
// travel with it and agents can read them: a hidden store after <main> holds the threads, and
// the element each thread is pinned to lists the thread ids in data-hr-comment.
//
//   <p data-hr-comment="cm1">Text the comment is about.</p>
//   <div data-hr-comments hidden>
//   <article data-hr-thread="cm1" data-x="0.42" data-y="0.5" data-quote="Text the comment is about.">
//   <p data-by="Simon" data-at="2026-10-09T15:04Z">Is this the 75th percentile?</p>
//   </article>
//   </div>
//
// data-x and data-y place the pin inside the element (fractions of its box), so a comment can
// point at a spot on a screenshot or chart. data-status="resolved" closes a thread.
import { removeAttributeEdit, setAttributeEdit } from "./build.mjs";
import { ancestors, attr, escapeHtml, normalizeText, parse, splice, textContent } from "./scan.mjs";

export const STORE_ATTR = "data-hr-comments";
export const ANCHOR_ATTR = "data-hr-comment";
export const THREAD_ATTR = "data-hr-thread";
const MAX_TEXT = 5000;

export const threadIdsOf = (element) => (attr(element, ANCHOR_ATTR) || "").split(/\s+/).filter(Boolean);
const fraction = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, Math.round(number * 1000) / 1000)) : 0;
};

/** Comment text from a browser: trimmed, without control characters, length-limited. */
export function cleanCommentText(text) {
  const clean = String(text ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!clean) throw new Error("Write a comment first.");
  if (clean.length > MAX_TEXT) throw new Error("The comment is too long.");
  return clean;
}

/** Threads in store order, each with its entries and the element it is pinned to (or null). */
export function readComments(source, doc = parse(source)) {
  const store = doc.elements.find((e) => attr(e, STORE_ATTR) !== null) || null;
  const anchors = new Map();
  for (const element of doc.elements) {
    if (store && element.start >= store.start && element.end <= store.end) continue;
    for (const id of threadIdsOf(element)) if (!anchors.has(id)) anchors.set(id, element);
  }
  const threads = (store ? store.children : []).filter((child) => attr(child, THREAD_ATTR)).map((article) => {
    const id = attr(article, THREAD_ATTR);
    return {
      id, element: article, anchor: anchors.get(id) || null,
      status: attr(article, "data-status") === "resolved" ? "resolved" : "open",
      x: fraction(attr(article, "data-x") ?? 1), y: fraction(attr(article, "data-y") ?? 0),
      quote: attr(article, "data-quote") || "",
      entries: article.children.filter((c) => c.name === "p").map((p) => ({ by: attr(p, "data-by") || "", at: attr(p, "data-at") || "", text: textContent(doc, p).trim() }))
    };
  });
  return { doc, store, threads };
}

/** Threads as plain data for the editor page and outline (no parser nodes). */
export function publicThreads(source) {
  return readComments(source).threads.map(({ id, status, x, y, quote, entries, anchor }) => ({ id, status, x, y, quote, entries, pinned: Boolean(anchor) }));
}

const entryHtml = ({ by, at, text }) => `<p data-by="${escapeHtml(by)}" data-at="${escapeHtml(at)}">${escapeHtml(text)}</p>`;
const threadHtml = ({ id, x, y, quote, entry }) =>
  `<article ${THREAD_ATTR}="${id}" data-x="${fraction(x)}" data-y="${fraction(y)}" data-quote="${escapeHtml(quote)}">\n${entryHtml(entry)}\n</article>\n`;

function nextThreadId(doc) {
  let max = 0;
  for (const element of doc.elements) {
    for (const id of [attr(element, THREAD_ATTR), ...threadIdsOf(element)]) {
      const match = /^cm(\d+)$/.exec(id || "");
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `cm${max + 1}`;
}

/** Edit that drops [start, end) and, when nothing else shares its lines, those whole lines. */
function removeLines(source, start, end) {
  let lineStart = start;
  while (lineStart > 0 && (source[lineStart - 1] === " " || source[lineStart - 1] === "\t")) lineStart--;
  let lineEnd = end;
  while (lineEnd < source.length && (source[lineEnd] === " " || source[lineEnd] === "\t")) lineEnd++;
  const alone = (lineStart === 0 || source[lineStart - 1] === "\n") && (lineEnd === source.length || source[lineEnd] === "\n");
  return alone ? { start: lineStart, end: Math.min(lineEnd + 1, source.length), text: "" } : { start, end, text: "" };
}

function setThreadIds(source, element, ids) {
  return ids.length ? setAttributeEdit(source, element, ANCHOR_ATTR, ids.join(" ")) : removeAttributeEdit(source, element, ANCHOR_ATTR);
}

/**
 * What a pin is on, in words: a text block's own text; for a chart, figure, card, or section,
 * its caption or first heading; otherwise the nearest heading above it.
 */
export function quoteFor(doc, element, kind = "scope") {
  const text = (node) => normalizeText(textContent(doc, node));
  const inside = (node) => node.start >= element.start && node.end <= element.end;
  if (kind !== "block") {
    const figure = [element, ...ancestors(element)].find((e) => e.name === "figure");
    const caption = figure && figure.children.find((c) => c.name === "figcaption");
    const heading = doc.elements.find((e) => /^h[1-4]$/.test(e.name) && inside(e));
    for (const label of [caption, heading]) if (label && text(label)) return text(label).slice(0, 100);
  }
  if (text(element)) return text(element).slice(0, 100);
  const above = doc.elements.filter((e) => /^h[1-4]$/.test(e.name) && e.end <= element.start).at(-1);
  return above ? text(above).slice(0, 100) : "";
}

/** Pin a new thread to `element` (a node of `doc`, parsed from `source`). */
export function addThread(source, doc, element, { x, y, text, by, at, kind }) {
  const { store } = readComments(source, doc);
  const id = nextThreadId(doc);
  const quote = quoteFor(doc, element, kind);
  const html = threadHtml({ id, x, y, quote, entry: { by, at, text: cleanCommentText(text) } });
  const edits = [setThreadIds(source, element, [...threadIdsOf(element), id])];
  if (store) edits.push({ start: store.innerEnd, end: store.innerEnd, text: html });
  else {
    const main = doc.elements.find((e) => e.name === "main" && e.close);
    const body = doc.elements.find((e) => e.name === "body");
    const runtime = doc.elements.find((e) => e.name === "script" && attr(e, "data-hr-runtime") !== null);
    const at = main ? main.end : runtime ? runtime.start : body && body.close ? body.innerEnd : source.length;
    edits.push({ start: at, end: at, text: `${main ? "\n" : ""}<div ${STORE_ATTR} hidden>\n${html}</div>${main ? "" : "\n"}` });
  }
  return { source: splice(source, edits), id };
}

function findThread(source, id) {
  const comments = readComments(source);
  const thread = comments.threads.find((t) => t.id === id);
  if (!thread) throw new Error("That comment no longer exists.");
  return { ...comments, thread };
}

export function replyToThread(source, id, { text, by, at }) {
  const { thread } = findThread(source, id);
  const at2 = thread.element.innerEnd;
  return splice(source, [{ start: at2, end: at2, text: `${entryHtml({ by, at, text: cleanCommentText(text) })}\n` }]);
}

export function setThreadStatus(source, id, status) {
  const { thread } = findThread(source, id);
  const edit = status === "resolved" ? setAttributeEdit(source, thread.element, "data-status", "resolved") : removeAttributeEdit(source, thread.element, "data-status");
  return edit ? splice(source, [edit]) : source;
}

/** Delete a thread, its pin, and the store once it is empty. */
export function deleteThread(source, id) {
  const { doc, store, threads, thread } = findThread(source, id);
  const edits = threads.length === 1 ? [removeLines(source, store.start, store.end)] : [removeLines(source, thread.element.start, thread.element.end)];
  for (const element of doc.elements) {
    if (element.start >= store.start && element.end <= store.end) continue;
    const ids = threadIdsOf(element);
    if (ids.includes(id)) edits.push(setThreadIds(source, element, ids.filter((other) => other !== id)));
  }
  return splice(source, edits);
}

/** A copy without any comments, for publishing. */
export function stripComments(source) {
  const doc = parse(source);
  const store = doc.elements.find((e) => attr(e, STORE_ATTR) !== null);
  const edits = store ? [removeLines(source, store.start, store.end)] : [];
  for (const element of doc.elements) {
    if (store && element.start >= store.start && element.end <= store.end) continue;
    if (attr(element, ANCHOR_ATTR) !== null) edits.push(removeAttributeEdit(source, element, ANCHOR_ATTR));
  }
  return edits.length ? splice(source, edits) : source;
}

/**
 * Keep pins through an AI rewrite of `before` (an element's outer HTML) into `after`: drop
 * pins the model invented or duplicated, and move pins it lost onto the rewritten element.
 */
export function keepPins(before, after) {
  const original = new Set(parse(before).elements.flatMap(threadIdsOf));
  if (!original.size && !after.includes(ANCHOR_ATTR)) return after;
  const doc = parse(after);
  const seen = new Set();
  const edits = [];
  const root = doc.root.children[0];
  let rootIds = root ? threadIdsOf(root) : [];
  for (const element of doc.elements) {
    const ids = threadIdsOf(element);
    if (!ids.length) continue;
    const kept = ids.filter((id) => original.has(id) && !seen.has(id));
    kept.forEach((id) => seen.add(id));
    if (element === root) rootIds = kept;
    else if (kept.length !== ids.length) edits.push(setThreadIds(after, element, kept));
  }
  const lost = [...original].filter((id) => !seen.has(id));
  if (root && (lost.length || rootIds.length !== threadIdsOf(root).length)) edits.push(setThreadIds(after, root, [...rootIds, ...lost]));
  return edits.length ? splice(after, edits.filter(Boolean)) : after;
}
