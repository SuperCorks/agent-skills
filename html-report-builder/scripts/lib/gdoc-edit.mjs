// `gdoc edit`: turn semantic operations on a read Doc model into batchUpdate requests.
// Content operations are applied from the end of the Doc backwards, so each one's indices are
// still the ones read at that revision; named ranges, comments, and replies (which Docs refuses
// in suggestion mode) follow in a direct batch at indices mapped through those changes, and
// accepting or rejecting suggestions comes last because it moves text by id, not by index.
import { emitBlocks, textStyleOf } from "./gdoc-emit.mjs";
import { ANSWER_PLACEHOLDER, runsText } from "./gdoc-blocks.mjs";
import { plainText, searchable } from "./gdoc-read.mjs";

const TEXT_RESET = "bold,italic,underline,strikethrough,smallCaps,baselineOffset,link,foregroundColor,backgroundColor,fontSize,weightedFontFamily";
export const OPS = ["replace-text", "set-paragraph", "insert", "delete", "replace-section", "set-answer", "replace-image", "accept", "reject", "comment", "reply"];

export class EditError extends Error {}
const fail = (message) => { throw new EditError(message); };

/** What a handle or id names in the model. */
export function resolve(model, ref) {
  const key = String(ref || "").trim();
  if (!key) fail("missing target");
  const p = model.paragraphs.find((x) => x.handle === key);
  if (p) return { kind: "paragraph", item: p };
  const t = model.tables.find((x) => x.handle === key);
  if (t) return { kind: "table", item: t };
  const i = model.images.find((x) => x.handle === key || x.objectId === key);
  if (i) return { kind: "image", item: i };
  const c = model.comments.find((x) => x.handle === key || x.id === key);
  if (c) return { kind: "comment", item: c };
  const g = model.suggestions.find((x) => x.handle === key || x.id === key);
  if (g) return { kind: "suggestion", item: g };
  const id = key.replace(/^k_/, "");
  const s = model.sections.find((x) => x.id === id);
  if (s) return { kind: "section", item: s };
  fail(`no paragraph, table, image, comment, suggestion, or section called ${key} in revision ${model.revisionId}`);
}

const topElements = (model) => [
  ...model.paragraphs.filter((p) => p.top).map((p) => ({ kind: "paragraph", start: p.start, end: p.end, item: p })),
  ...model.tables.filter((t) => t.top).map((t) => ({ kind: "table", start: t.start, end: t.end, item: t })),
].sort((a, b) => a.start - b.start);

/** The insertion point for content placed after or before a target, and whether a table may attach. */
function insertionPoint(model, op) {
  const ref = op.after ?? op.before;
  if (ref === undefined) fail("insert needs `after` or `before`");
  const target = resolve(model, ref);
  const tops = topElements(model);
  const elementEndingAt = (x) => tops.find((e) => e.end === x);
  const elementStartingAt = (x) => tops.find((e) => e.start === x);
  let x;
  if (target.kind === "paragraph") {
    if (target.item.cell) fail(`${ref} is inside a table cell; insert before or after the table (${target.item.cell.table})`);
    x = op.after !== undefined ? target.item.end : target.item.start;
  } else if (target.kind === "table") {
    if (op.before !== undefined) {
      const prev = tops.filter((e) => e.end <= target.item.start).at(-1);
      fail(`content cannot go directly before a table; insert after ${prev ? prev.item.handle : "the paragraph before it"} instead`);
    }
    x = target.item.end;
  } else if (target.kind === "section") {
    x = op.after !== undefined ? target.item.end : target.item.start;
  } else fail(`cannot insert next to a ${target.kind}`);
  if (x >= model.bodyEnd) x = model.bodyEnd - 1;
  const next = elementStartingAt(x);
  if (!next || next.kind !== "paragraph") fail(`nothing can be inserted at ${x}: no paragraph starts there`);
  const prev = elementEndingAt(x);
  return { x, prevNewline: Boolean(prev && prev.kind === "paragraph" && prev.item.plain), target };
}

/**
 * Validate operations and convert their HTML. `convert(html)` returns {blocks, shots, images,
 * notes} from gdoc-blocks (fragment mode). Returns the prepared list plus what must be hosted.
 */
export function prepareOps(model, ops, { convert }) {
  if (!Array.isArray(ops)) fail("ops must be a JSON array of operations");
  const prepared = [];
  const shots = [];
  const images = new Map();
  const notes = [];
  let outbound = false;
  for (const [n, raw] of ops.entries()) {
    const op = { ...raw, n };
    if (!OPS.includes(op.op)) fail(`operation ${n + 1}: unknown op ${JSON.stringify(op.op)} (one of ${OPS.join(", ")})`);
    if (["insert", "replace-section"].includes(op.op) || (op.op === "set-paragraph" && op.html !== undefined)) {
      const html = op.op === "set-paragraph" ? `<p>${op.html}</p>` : op.html;
      if (typeof html !== "string" || !html.trim()) fail(`operation ${n + 1}: ${op.op} needs html`);
      const converted = convert(html);
      op.blocks = converted.blocks;
      shots.push(...converted.shots);
      for (const [k, v] of converted.images) images.set(k, v);
      notes.push(...converted.notes);
      if (op.op === "set-paragraph") {
        const first = converted.blocks.find((b) => b.type === "p");
        op.runs = first ? first.runs : [];
      }
    }
    if (op.op === "comment" || (op.op === "reply" && op.text)) outbound = true;
    prepared.push(op);
  }
  return { prepared, shots, images, notes, outbound };
}

/**
 * Plan requests. Options: suggest (writeMode SUGGEST for content), images (key -> {uri, width}),
 * palette, fonts. Returns {content, after, notes, summary}: `content` is sent in the chosen
 * mode, `after` directly (named ranges, comments, replies, accept/reject) once content applied.
 */
export function planEdits(model, prepared, { suggest = false, images = new Map(), palette, fonts = {} }) {
  const notes = [];
  const summary = [];
  const changes = []; // content operations: {start, end, shift, delta, run(), metas}
  const after = [];
  const settle = [];
  const replies = [];
  const comments = [];

  const add = (change) => changes.push(change);

  for (const op of prepared) {
    const label = `operation ${op.n + 1} (${op.op})`;
    switch (op.op) {
      case "replace-text": {
        if (typeof op.find !== "string" || !op.find) fail(`${label}: needs find`);
        if (typeof op.replace !== "string") fail(`${label}: needs replace (use "" to delete)`);
        const scope = op.in ? scopeOf(model, op.in) : { start: 1, end: model.bodyEnd };
        const { text, index } = searchable(model, scope);
        const hits = [];
        for (let at = text.indexOf(op.find); at >= 0; at = text.indexOf(op.find, at + 1)) hits.push(at);
        if (!hits.length) fail(`${label}: ${JSON.stringify(op.find)} is not in ${op.in || "the Doc"} at revision ${model.revisionId}`);
        if (hits.length > 1 && !op.all) fail(`${label}: ${JSON.stringify(op.find)} appears ${hits.length} times in ${op.in || "the Doc"} (${[...new Set(hits.map((h) => paragraphAt(model, index[h])?.handle))].join(", ")}); narrow it with "in" or pass "all": true`);
        for (const h of hits) {
          const s = index[h];
          const e = index[h + op.find.length - 1] + 1;
          if (e - s !== op.find.length || index.slice(h, h + op.find.length).some((v) => v < 0)) fail(`${label}: the match at ${paragraphAt(model, s)?.handle} spans a suggestion or image`);
          add({
            start: s, end: e, shift: e, delta: op.replace.length - (suggest ? 0 : e - s), removes: suggest ? null : [s, e],
            boundary: { at: e, extend: containing(model, s, e) },
            run: () => [
              ...(op.replace ? [{ insertText: { location: { index: e }, text: op.replace } }] : []),
              { deleteContentRange: { range: { startIndex: s, endIndex: e } } },
            ],
          });
        }
        summary.push(`replace ${JSON.stringify(op.find)} → ${JSON.stringify(op.replace)}${hits.length > 1 ? ` (${hits.length}×)` : ""}`);
        break;
      }
      case "set-paragraph": {
        const target = resolve(model, op.p);
        if (target.kind !== "paragraph") fail(`${label}: ${op.p} is not a paragraph`);
        const p = target.item;
        if (p.images.length) fail(`${label}: ${op.p} holds an image (${p.images.join(", ")}); use replace-image, or delete and insert`);
        const runs = op.runs || [{ text: String(op.text ?? "") }];
        const text = runsText(runs);
        const s = p.start;
        const e = p.end - 1; // keep the paragraph's newline (and so its style and list)
        add({
          start: s, end: e, shift: e, delta: text.length - (suggest ? 0 : e - s), removes: suggest || e <= s ? null : [s, e],
          boundary: { at: e, extend: containing(model, s, e) },
          run: () => {
            const requests = [];
            if (text) {
              requests.push({ insertText: { location: { index: e }, text } });
              requests.push({ updateTextStyle: { range: { startIndex: e, endIndex: e + text.length }, textStyle: {}, fields: TEXT_RESET } });
              let offset = e;
              for (const run of runs) {
                const style = textStyleOf(run, fonts);
                if (Object.keys(style).length) requests.push({ updateTextStyle: { range: { startIndex: offset, endIndex: offset + run.text.length }, textStyle: style, fields: Object.keys(style).join(",") } });
                offset += run.text.length;
              }
            }
            if (e > s) requests.push({ deleteContentRange: { range: { startIndex: s, endIndex: e } } });
            if (op.style) requests.push({ updateParagraphStyle: { range: { startIndex: s, endIndex: s + 1 }, paragraphStyle: { namedStyleType: op.style }, fields: "namedStyleType" } });
            return requests;
          },
        });
        summary.push(`rewrite ${op.p}`);
        break;
      }
      case "insert": {
        const { x, prevNewline, target } = insertionPoint(model, op);
        const change = insertChange(model, op.blocks, x, prevNewline, { suggest, images, palette, fonts });
        change.boundary = { at: x, extend: new Set(rangesToExtend(model, target, op, x)) };
        add(change);
        summary.push(`insert ${op.after !== undefined ? "after" : "before"} ${op.after ?? op.before}`);
        break;
      }
      case "delete": {
        const { start, end } = deletionRange(model, op);
        add({ start, end, shift: end, delta: suggest ? 0 : -(end - start), removes: suggest ? null : [start, end], run: () => [{ deleteContentRange: { range: { startIndex: start, endIndex: end } } }] });
        summary.push(`delete ${op.section || op.from}${op.to ? `–${op.to}` : ""}`);
        break;
      }
      case "replace-section": {
        const target = resolve(model, op.section);
        if (target.kind !== "section") fail(`${label}: ${op.section} is not a section id`);
        const s = target.item;
        const { start, end } = deletionRange(model, { section: s.id });
        const tops = topElements(model);
        const prev = tops.find((el) => el.end === end);
        const ownRange = op.blocks.some((b) => b.type === "open" && b.name === s.name);
        const blocks = ownRange ? op.blocks : [{ type: "open", name: s.name }, ...op.blocks, { type: "close", name: s.name }];
        const change = insertChange(model, blocks, end, Boolean(prev && prev.kind === "paragraph" && prev.item.plain), { suggest, images, palette, fonts });
        // The new content stays inside every section around the one it replaces.
        change.boundary = { at: end, extend: new Set(Object.keys(model.ranges).filter((name) => name !== s.name && !name.endsWith("_answer") && model.ranges[name].start <= s.start && model.ranges[name].end === end)) };
        // Applied directly, deleting the old text pulls the new content back by its length.
        if (!suggest) for (const meta of change.metas) { if (meta.start >= end) { meta.start -= end - start; meta.end -= end - start; } }
        const inner = change.run;
        change.start = start;
        change.run = () => [...inner(), { deleteContentRange: { range: { startIndex: start, endIndex: end } } }];
        if (!suggest) { change.delta -= end - start; change.removes = [start, end]; }
        // Suggested: the old text stays until accepted, so the range spans old and new.
        if (suggest) change.metasExtra = [{ type: "range", name: s.name, start, endLocal: () => change.localEnd }];
        change.replaces = s.name;
        if (suggest) notes.push(`${s.id}: comments on the old text stay anchored until the suggestion is accepted`);
        else notes.push(`${s.id}: comments anchored in the old text lose their anchor`);
        add(change);
        summary.push(`replace section ${s.id}`);
        break;
      }
      case "set-answer": {
        const name = `k_${String(op.q || "").replace(/^k_/, "").replace(/_answer$/, "")}_answer`;
        const range = model.ranges[name];
        if (!range) fail(`${label}: no answer cell ${name}`);
        const text = String(op.text ?? "");
        if (!text) fail(`${label}: needs text`);
        if (!suggest) {
          add({
            start: range.start, end: range.end, shift: range.end, delta: text.length - (range.end - range.start),
            run: () => [
              { replaceNamedRangeContent: { namedRangeName: name, text } },
              { updateTextStyle: { range: { startIndex: range.start, endIndex: range.start + text.length }, textStyle: {}, fields: TEXT_RESET } },
            ],
          });
        } else {
          const change = {
            start: range.start, end: range.end, shift: range.end, delta: text.length,
            run: () => [
              { insertText: { location: { index: range.end }, text } },
              { updateTextStyle: { range: { startIndex: range.end, endIndex: range.end + text.length }, textStyle: {}, fields: TEXT_RESET } },
              { deleteContentRange: { range: { startIndex: range.start, endIndex: range.end } } },
            ],
          };
          change.metasExtra = [{ type: "range", name, start: range.start, endLocal: () => range.end + text.length }];
          change.replaces = name;
          add(change);
        }
        summary.push(`answer ${name.slice(2, -7)}`);
        break;
      }
      case "replace-image": {
        const target = resolve(model, op.image);
        if (target.kind !== "image") fail(`${label}: ${op.image} is not an image`);
        const image = images.get(op.imageKey);
        if (!image) fail(`${label}: the replacement image was not uploaded`);
        add({ start: target.item.index, end: target.item.index + 1, shift: target.item.index + 1, delta: 0, run: () => [{ replaceImage: { imageObjectId: target.item.objectId, uri: image.uri, imageReplaceMethod: "CENTER_CROP" } }] });
        summary.push(`replace image ${op.image}`);
        break;
      }
      case "accept": case "reject": {
        const target = resolve(model, op.suggestion);
        if (target.kind !== "suggestion") fail(`${label}: ${op.suggestion} is not a suggestion`);
        settle.push({ [`${op.op}Suggestion`]: { suggestionId: target.item.id } });
        summary.push(`${op.op} ${target.item.handle} (${target.item.summary || target.item.id})`);
        break;
      }
      case "comment": {
        if (!op.text) fail(`${label}: needs text`);
        const range = commentRange(model, op);
        comments.push({ range, text: String(op.text) });
        summary.push(`comment on ${op.on || op.in}`);
        break;
      }
      case "reply": {
        const target = resolve(model, op.comment);
        if (target.kind !== "comment") fail(`${label}: ${op.comment} is not a comment`);
        if (!op.text && !op.resolve && !op.reopen) fail(`${label}: needs text, resolve, or reopen`);
        const post = { ...(op.text ? { content: String(op.text) } : {}), ...(op.resolve ? { commentAction: "RESOLVE" } : op.reopen ? { commentAction: "REOPEN" } : {}) };
        replies.push({ addCommentReply: { commentId: target.item.id, post } });
        summary.push(`${op.text ? "reply to" : op.resolve ? "resolve" : "reopen"} ${target.item.handle}`);
        break;
      }
      default: fail(`${label}: unsupported`);
    }
  }

  // Apply content from the end backwards; refuse operations that touch the same text.
  changes.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < changes.length; i++) {
    const higher = changes[i - 1];
    const lower = changes[i];
    const point = (c) => c.start === c.end;
    if (lower.end > higher.start || (lower.end === higher.start && (point(lower) || point(higher)))) fail(`two operations change overlapping text near index ${higher.start}; split them into separate edits`);
  }
  const content = [];
  for (const change of changes) {
    content.push(...change.run());
  }
  // Where a position read at this revision ends up after every content change. At an
  // insertion point the content can land before it (a range that ends there and does not take
  // the content) or after it (everything else).
  const finalAfter = (i) => i + changes.filter((c) => c.shift <= i).reduce((sum, c) => sum + c.delta, 0);
  const finalBefore = (i) => i + changes.filter((c) => c.shift < i || (c.shift === i && !c.boundary)).reduce((sum, c) => sum + c.delta, 0);
  const laterDelta = (k) => changes.slice(k + 1).reduce((sum, c) => sum + c.delta, 0);
  // Docs refuses to delete a named range that does not exist (one this edit is creating).
  // Ranges inside text deleted outright are gone by then.
  const existing = new Set(Object.keys(model.ranges).filter((name) => !changes.some((c) => c.removes && model.ranges[name].start >= c.removes[0] && model.ranges[name].end <= c.removes[1])));
  const handled = new Set();
  const rename = (name, startIndex, endIndex) => {
    if (existing.has(name)) { after.push({ deleteNamedRange: { name } }); existing.delete(name); }
    if (endIndex > startIndex) after.push({ createNamedRange: { name, range: { startIndex, endIndex } } });
    handled.add(name);
  };
  changes.forEach((change, k) => {
    const shiftBy = laterDelta(k);
    for (const meta of change.metas || []) {
      if (meta.type === "range") rename(meta.name, meta.start + shiftBy, meta.end + shiftBy);
      if (meta.type === "link") after.push({ updateTextStyle: { range: { startIndex: meta.start + shiftBy, endIndex: meta.end + shiftBy }, textStyle: { link: meta.link }, fields: "link" } });
    }
    for (const meta of change.metasExtra || []) rename(meta.name, finalAfter(meta.start), meta.endLocal() + shiftBy);
  });
  // Ranges that start or end where content went in are rewritten with the bounds meant:
  // Docs moves a boundary that touches an insertion differently in suggestion mode.
  for (const [name, r] of Object.entries(model.ranges)) {
    if (handled.has(name) || !existing.has(name)) continue;
    const startHit = changes.some((c) => c.boundary && c.boundary.at === r.start);
    const endHit = changes.find((c) => c.boundary && c.boundary.at === r.end);
    if (!startHit && !endHit) continue;
    rename(name, finalAfter(r.start), endHit && endHit.boundary.extend.has(name) ? finalAfter(r.end) : finalBefore(r.end));
  }
  for (const c of comments) {
    if (changes.some((ch) => c.range.start < ch.end && c.range.end > ch.start)) fail(`a new comment's text is also being changed in this edit; comment in a separate edit`);
    after.push({ insertComment: { range: { startIndex: finalAfter(c.range.start), endIndex: finalAfter(c.range.end - 1) + 1 }, content: c.text } });
  }
  after.push(...replies, ...settle);
  return { content, after, notes, summary };
}

function insertChange(model, blocks, x, prevNewline, { suggest, images, palette, fonts }) {
  const emitted = emitBlocks(blocks, { cursor: x, prevNewline, images, reset: true, suggest, palette, fonts });
  const length = emitted.end - x;
  const metas = [];
  for (const r of emitted.ranges) metas.push({ type: "range", name: r.name, start: r.start, end: r.end });
  for (const link of emitted.links) {
    const section = model.sections.find((s) => s.id === link.anchor);
    const head = section && model.paragraphs.find((p) => p.start === section.start && p.headingId);
    if (head) metas.push({ type: "link", start: link.start, end: link.end, link: { heading: { id: head.headingId, ...(model.tabId ? { tabId: model.tabId } : {}) } } });
  }
  const change = { start: x, end: x, shift: x, delta: length, run: () => emitted.requests, metas };
  Object.defineProperty(change, "localEnd", { get: () => emitted.end });
  return change;
}

/** Ranges around [s, e): a replacement there stays inside them. */
function containing(model, s, e) {
  return new Set(Object.keys(model.ranges).filter((name) => model.ranges[name].start <= s && model.ranges[name].end >= e));
}

/** Ranges that should take in content appended at x (the target's own ranges ending there). */
function rangesToExtend(model, target, op, x) {
  if (op.before !== undefined) return [];
  const fragmentIsSection = op.blocks[0]?.type === "open" && op.blocks.at(-1)?.type === "close" && op.blocks.filter((b) => b.type === "open").length >= 1 && op.blocks[1]?.style?.startsWith("HEADING_1");
  const contains = (name) => {
    const r = model.ranges[name];
    if (!r || name.endsWith("_answer")) return false;
    if (target.kind === "section") return r.start <= target.item.start && r.end >= target.item.end && !(fragmentIsSection && name === target.item.name);
    return r.start <= target.item.start && r.end >= target.item.end;
  };
  return Object.keys(model.ranges).filter((name) => model.ranges[name].end === x && contains(name));
}

function deletionRange(model, op) {
  let start;
  let end;
  if (op.section) {
    const target = resolve(model, op.section);
    if (target.kind !== "section") fail(`${op.section} is not a section id`);
    ({ start, end } = target.item);
  } else {
    const from = resolve(model, op.from);
    const to = op.to ? resolve(model, op.to) : from;
    for (const t of [from, to]) {
      if (!["paragraph", "table"].includes(t.kind)) fail(`delete takes paragraphs, tables, or a section, not a ${t.kind}`);
      if (t.kind === "paragraph" && t.item.cell) fail(`${t.item.handle} is inside a table cell: rewrite it with set-paragraph instead`);
    }
    start = from.item.start;
    end = to.item.end;
    if (end <= start) fail("delete: `to` comes before `from`");
  }
  if (end >= model.bodyEnd) end = model.bodyEnd - 1;
  // The newline right before a table that stays cannot go; keep it as an empty paragraph.
  const tables = model.tables.filter((t) => t.top);
  if (tables.some((t) => t.start === end)) end -= 1;
  if (end <= start) fail("nothing to delete there");
  return { start, end };
}

function scopeOf(model, ref) {
  const target = resolve(model, ref);
  if (target.kind === "paragraph" || target.kind === "table") return { start: target.item.start, end: target.item.end };
  if (target.kind === "section") return { start: target.item.start, end: target.item.end };
  fail(`${ref} cannot be searched`);
}

function commentRange(model, op) {
  if (op.find) {
    const scope = op.in ? scopeOf(model, op.in) : { start: 1, end: model.bodyEnd };
    const { text, index } = searchable(model, scope);
    const at = text.indexOf(op.find);
    if (at < 0) fail(`comment: ${JSON.stringify(op.find)} not found`);
    if (text.indexOf(op.find, at + 1) >= 0) fail(`comment: ${JSON.stringify(op.find)} appears more than once; narrow it with "in"`);
    return { start: index[at], end: index[at + op.find.length - 1] + 1 };
  }
  const target = resolve(model, op.on);
  if (target.kind === "paragraph") {
    const text = plainText(target.item);
    if (!text.trim()) fail(`comment: ${op.on} is empty`);
    return { start: target.item.start, end: target.item.end - 1 };
  }
  if (target.kind === "section") {
    const first = model.paragraphs.find((p) => p.handle === target.item.first);
    return { start: first.start, end: first.end - 1 };
  }
  fail(`comment: ${op.on} cannot carry a comment`);
}

function paragraphAt(model, index) {
  return model.paragraphs.find((p) => p.start <= index && index < p.end) || null;
}

export { ANSWER_PLACEHOLDER };
