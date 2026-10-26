// Read a Google Doc (documents.get with includeTabsContent, comments, and suggestions inline)
// into the model `gdoc outline` prints and `gdoc edit` resolves handles against: paragraphs
// p1…, tables t1…, images i1…, comments c1…, and suggestions g1…, each placed in the innermost
// `k_<id>` named range around it. Handles are positions in one revision; edits name the
// revision they were read at, and Google merges them with anything typed since.
import { ANSWER_PLACEHOLDER } from "./gdoc-blocks.mjs";

const HEADINGS = { TITLE: "Title", SUBTITLE: "Sub", HEADING_1: "H1", HEADING_2: "H2", HEADING_3: "H3", HEADING_4: "H4", HEADING_5: "H5", HEADING_6: "H6" };

export function docUrl(id) {
  return `https://docs.google.com/document/d/${id}/edit`;
}

/** A Doc id from an id, a docs.google.com URL, or null. */
export function docIdFrom(value) {
  const text = String(value || "").trim();
  const m = /\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(text);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null;
}

export function readDocument(json) {
  const tab = json.tabs?.[0];
  const dt = tab ? tab.documentTab : json;
  const tabId = tab?.tabProperties?.tabId || null;
  const paragraphs = [];
  const tables = [];
  const images = [];
  const suggestionAt = new Map();
  const noteSuggestion = (ids, index) => { for (const id of ids || []) if (!suggestionAt.has(id) || suggestionAt.get(id) > index) suggestionAt.set(id, index); };

  const walk = (content, cell, depth = 0) => {
    for (const el of content || []) {
      if (el.paragraph) {
        const p = el.paragraph;
        const handle = `p${paragraphs.length + 1}`;
        const runs = [];
        const own = [];
        for (const e of p.elements || []) {
          if (e.textRun) {
            const tr = e.textRun;
            runs.push({ start: e.startIndex, end: e.endIndex, content: tr.content, ins: tr.suggestedInsertionIds || null, del: tr.suggestedDeletionIds || null, style: tr.textStyle || {} });
            noteSuggestion(tr.suggestedInsertionIds, e.startIndex);
            noteSuggestion(tr.suggestedDeletionIds, e.startIndex);
            noteSuggestion(Object.keys(tr.suggestedTextStyleChanges || {}), e.startIndex);
          } else if (e.inlineObjectElement) {
            const image = { handle: `i${images.length + 1}`, objectId: e.inlineObjectElement.inlineObjectId, index: e.startIndex, paragraph: handle };
            images.push(image);
            own.push(image.handle);
            runs.push({ start: e.startIndex, end: e.endIndex, content: "￼", image: image.handle, ins: e.inlineObjectElement.suggestedInsertionIds || null, del: e.inlineObjectElement.suggestedDeletionIds || null, style: {} });
            noteSuggestion(e.inlineObjectElement.suggestedInsertionIds, e.startIndex);
          } else {
            runs.push({ start: e.startIndex, end: e.endIndex, content: "￼".repeat(Math.max(0, e.endIndex - e.startIndex)), other: true, style: {} });
          }
        }
        noteSuggestion(Object.keys(p.suggestedParagraphStyleChanges || {}), el.startIndex);
        noteSuggestion(Object.keys(p.suggestedBulletChanges || {}), el.startIndex);
        const style = p.paragraphStyle?.namedStyleType || "NORMAL_TEXT";
        paragraphs.push({
          handle, start: el.startIndex, end: el.endIndex, style, headingId: p.paragraphStyle?.headingId || null,
          bullet: p.bullet ? { listId: p.bullet.listId, level: p.bullet.nestingLevel || 0 } : null,
          // Plain: no list, indent, or shading a table attached after it would inherit.
          plain: !p.bullet && !p.paragraphStyle?.indentStart?.magnitude && !p.paragraphStyle?.shading?.backgroundColor?.color,
          runs, images: own, cell, top: !cell,
        });
      } else if (el.table) {
        const t = el.table;
        const table = { handle: `t${tables.length + 1}`, start: el.startIndex, end: el.endIndex, rows: t.rows, cols: t.columns, cells: [], top: !cell };
        tables.push(table);
        noteSuggestion(t.suggestedInsertionIds, el.startIndex);
        noteSuggestion(t.suggestedDeletionIds, el.startIndex);
        (t.tableRows || []).forEach((row, r) => {
          table.cells[r] = [];
          (row.tableCells || []).forEach((tc, c) => {
            const first = paragraphs.length;
            walk(tc.content, { table: table.handle, row: r, col: c }, depth + 1);
            table.cells[r][c] = { start: tc.startIndex, end: tc.endIndex, paragraphs: paragraphs.slice(first).filter((x) => x.cell && x.cell.table === table.handle && x.cell.row === r && x.cell.col === c).map((x) => x.handle) };
          });
        });
      }
    }
  };
  walk(dt.body?.content || [], null);
  const bodyEnd = (dt.body?.content || []).at(-1)?.endIndex || 1;

  const ranges = {};
  for (const [name, value] of Object.entries(dt.namedRanges || {})) {
    const first = value.namedRanges?.[0]?.ranges?.[0];
    if (first) ranges[name] = { start: first.startIndex, end: first.endIndex };
  }
  const sections = Object.entries(ranges)
    .filter(([name]) => name.startsWith("k_") && !name.endsWith("_answer"))
    .map(([name, r]) => ({ id: name.slice(2), name, start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  for (const s of sections) {
    const parent = sections.filter((o) => o !== s && o.start <= s.start && o.end >= s.end && (o.end - o.start) > (s.end - s.start)).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    s.parent = parent ? parent.id : null;
  }
  const sectionOf = (index) => {
    let best = null;
    for (const s of sections) if (s.start <= index && index < s.end && (!best || s.end - s.start < best.end - best.start)) best = s;
    return best ? best.id : null;
  };
  let last = null;
  for (const p of paragraphs) {
    const found = sectionOf(p.start);
    if (found) { p.section = found; if (p.top) last = found; }
    else { p.section = last; p.outside = Boolean(last) && plainText(p).trim() !== ""; }
  }
  for (const t of tables) t.section = sectionOf(t.start) || paragraphs.find((p) => p.start > t.start)?.section || null;
  for (const s of sections) {
    const inside = paragraphs.filter((p) => p.start >= s.start && p.start < s.end);
    s.first = inside[0]?.handle || null;
    s.last = inside.at(-1)?.handle || null;
    const head = inside.find((p) => p.style.startsWith("HEADING") || p.style === "TITLE");
    const worded = inside.find((p) => plainText(p).replace(/\ufffc/g, "").trim());
    s.title = head ? plainText(head).trim() : worded ? plainText(worded).replace(/\ufffc/g, "").trim().slice(0, 60) : "";
  }

  const paragraphAt = (index) => paragraphs.find((p) => p.start <= index && index < p.end) || null;
  const comments = (json.comments || []).map((c, n) => {
    const anchor = c.anchorId && dt.commentAnchors?.[c.anchorId]?.ranges?.[0];
    const at = anchor ? paragraphAt(anchor.startIndex) : null;
    return {
      handle: `c${n + 1}`, id: c.commentId, status: c.status || "OPEN", quote: c.plainTextQuote || "",
      author: c.headPost?.author?.displayName || "Someone", me: Boolean(c.headPost?.author?.me), text: c.headPost?.content || "",
      replies: (c.replies || []).filter((r) => !r.deleted).map((r) => ({ author: r.author?.displayName || "Someone", me: Boolean(r.author?.me), text: r.content || "" })),
      anchor: anchor ? { start: anchor.startIndex, end: anchor.endIndex } : null,
      paragraph: at ? at.handle : null, section: anchor ? sectionOf(anchor.startIndex) || at?.section || null : null,
    };
  });
  const suggestions = (json.suggestions || []).map((s, n) => {
    const at = suggestionAt.has(s.suggestionId) ? suggestionAt.get(s.suggestionId) : null;
    const p = at !== null ? paragraphAt(at) : null;
    return {
      handle: `g${n + 1}`, id: s.suggestionId, status: s.status || "OPEN", summary: s.summaryText || "",
      author: s.headPost?.author?.displayName || "Someone", me: Boolean(s.headPost?.author?.me),
      at, paragraph: p ? p.handle : null, section: at !== null ? sectionOf(at) || p?.section || null : null,
    };
  });
  const answers = {};
  for (const [name, r] of Object.entries(ranges)) {
    if (!name.startsWith("k_") || !name.endsWith("_answer")) continue;
    let text = textInRange(paragraphs, r.start, r.end).trim();
    if (text.startsWith(ANSWER_PLACEHOLDER)) text = text.slice(ANSWER_PLACEHOLDER.length).trim();
    answers[name.slice(2, -"_answer".length)] = text;
  }
  return { id: json.documentId, title: json.title || "", revisionId: json.revisionId || null, tabId, bodyEnd, paragraphs, tables, images, ranges, sections, comments, suggestions, answers };
}

/** Text as it reads now: suggested insertions in, suggested deletions out, images as U+FFFC. */
export function plainText(paragraph) {
  return paragraph.runs.filter((r) => !r.del).map((r) => r.content).join("").replace(/\n$/, "");
}

/** Text with suggestions marked: [+inserted+] and [-deleted-]. */
export function displayText(paragraph, images = true) {
  return paragraph.runs.map((r) => {
    let text = r.image ? (images ? `[image ${r.image}]` : "") : r.content;
    text = text.replace(/\n$/, "").replace(/\u000b/g, "↵");
    if (r.del) return text ? `[-${text}-]` : "";
    if (r.ins) return text ? `[+${text}+]` : "";
    return text;
  }).join("");
}

function textInRange(paragraphs, start, end) {
  let text = "";
  for (const p of paragraphs) {
    if (p.end <= start || p.start >= end) continue;
    for (const r of p.runs) {
      if (r.del) continue;
      for (let i = 0; i < r.content.length; i++) {
        const index = r.start + i;
        if (index >= start && index < end) text += r.content[i];
      }
    }
  }
  return text.replace(/\n+$/, "").replace(/\n/g, " ");
}

/**
 * Characters a search can match: suggested deletions and images are skipped, so a match is a
 * run of live text. Returns {text, index: [doc index per character]}.
 */
export function searchable(model, { start = 1, end = Infinity } = {}) {
  let text = "";
  const index = [];
  for (const p of model.paragraphs) {
    if (p.end <= start || p.start >= end) continue;
    for (const r of p.runs) {
      if (r.del || r.image || r.other) { text += "\u0000"; index.push(-1); continue; }
      for (let i = 0; i < r.content.length; i++) {
        const at = r.start + i;
        if (at < start || at >= end) continue;
        text += r.content[i];
        index.push(at);
      }
    }
  }
  return { text, index };
}

const short = (text, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** The outline `gdoc outline` prints. */
export function formatOutline(model, { section = null, full = false } = {}) {
  const lines = [];
  lines.push(model.title || "(untitled)");
  lines.push(docUrl(model.id));
  lines.push(`Revision ${model.revisionId}`);
  const openComments = model.comments.filter((c) => c.status === "OPEN");
  const openSuggestions = model.suggestions.filter((s) => s.status === "OPEN");
  if (!section) {
    lines.push("", "Sections:");
    if (!model.sections.length) lines.push("  (no k_ ranges: this Doc was not created by gdoc create; paragraphs are listed by handle)");
    for (const s of model.sections) {
      const depth = ancestorsOf(model, s).length;
      lines.push(`  ${"  ".repeat(depth)}${s.id}  ${JSON.stringify(short(s.title, 70))}  ${s.first || "?"}–${s.last || "?"}`);
    }
    const answerIds = Object.keys(model.answers);
    if (answerIds.length) {
      lines.push("", "Answers:");
      for (const id of answerIds) lines.push(`  ${id}: ${model.answers[id] ? JSON.stringify(model.answers[id]) : "(not answered)"}`);
    }
  }
  const inSection = (item) => !section || item.section === section || isInside(model, item.section, section);
  const comments = openComments.filter(inSection);
  lines.push("", `Open comments (${comments.length}${model.comments.length > openComments.length ? `, ${model.comments.length - openComments.length} resolved` : ""}):`);
  for (const c of comments) {
    lines.push(`  ${c.handle} [${c.section || "—"} · ${c.paragraph || "unanchored"}] ${c.author}${c.me ? " (you)" : ""}: ${JSON.stringify(c.text)}${c.quote ? ` on ${JSON.stringify(short(c.quote, 60))}` : ""}`);
    for (const r of c.replies) lines.push(`      ↳ ${r.author}${r.me ? " (you)" : ""}: ${JSON.stringify(r.text)}`);
  }
  const suggestions = openSuggestions.filter(inSection);
  lines.push("", `Open suggestions (${suggestions.length}):`);
  for (const s of suggestions) lines.push(`  ${s.handle} [${s.section || "—"} · ${s.paragraph || "?"}] ${s.author}${s.me ? " (you)" : ""}: ${s.summary || "(formatting change)"}`);
  lines.push("", section ? `Section ${section}:` : "Content:");
  for (const t of model.tables) t.listed = false;
  let current;
  for (const p of model.paragraphs) {
    if (section && !(p.section === section || isInside(model, p.section, section))) continue;
    const owner = p.cell ? model.tables.find((x) => x.handle === p.cell.table)?.section ?? p.section : p.section;
    if (owner !== current) { current = owner; lines.push(`  ${owner ? `[${owner}]` : "[no section]"}`); }
    if (p.cell) {
      const t = model.tables.find((x) => x.handle === p.cell.table);
      if (t && !t.listed) {
        t.listed = true;
        const answer = Object.keys(model.ranges).find((name) => name.endsWith("_answer") && model.ranges[name].start >= t.start && model.ranges[name].end <= t.end);
        lines.push(`    ${t.handle.padEnd(5)} table ${t.rows}×${t.cols}${answer ? ` (answer cell of ${answer.slice(2, -7)})` : ""}`);
      }
      if (!full && !section && t && t.rows > 4 && p.cell.row > 0) continue;
    }
    const tag = HEADINGS[p.style] || (p.bullet ? `•${p.bullet.level ? p.bullet.level : ""}` : "");
    const where = p.cell ? `${p.cell.row},${p.cell.col}: ` : "";
    const text = displayText(p);
    lines.push(`    ${p.handle.padEnd(5)} ${p.outside ? "+" : " "}${tag.padEnd(6)}${p.cell ? "  " : ""}${where}${full || section ? text : short(text)}`);
  }
  if (model.paragraphs.some((p) => p.outside && (!section || p.section === section || isInside(model, p.section, section)))) lines.push("", "  + outside every k_ range (added later, after the section named above it)");
  return lines.join("\n");
}

function ancestorsOf(model, s) {
  const list = [];
  let parent = s.parent;
  while (parent) { list.push(parent); parent = model.sections.find((x) => x.id === parent)?.parent; }
  return list;
}

function isInside(model, child, ancestor) {
  if (!child) return false;
  const s = model.sections.find((x) => x.id === child);
  return s ? ancestorsOf(model, s).includes(ancestor) : false;
}
