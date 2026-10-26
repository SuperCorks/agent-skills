// Turn blocks (gdoc-blocks.mjs) into Google Docs batchUpdate requests, tracking every index so
// one forward pass is valid as written. Layout rules the Docs API imposes (checked live):
// - insertText inherits the style of the paragraph and of the character before it, so every
//   inserted paragraph gets its paragraph style set and, when editing, its text style reset;
// - createParagraphBullets reads nesting from leading tabs and then deletes them;
// - insertTable puts a newline before the table. Inserted at the previous paragraph's newline,
//   that newline ends the previous paragraph and the old one becomes an empty paragraph after
//   the table, which is deleted (the one before a table never can be);
// - an r×c table inserted at i starts at T = i + 1 and the paragraph of cell (r, c) is at
//   T + 3 + r(1 + 2c') + 2c (c' = column count), so cells are filled last to first.
import { CONTENT_WIDTH, runsText } from "./gdoc-blocks.mjs";

const PRESETS = { bullet: "BULLET_DISC_CIRCLE_SQUARE", number: "NUMBERED_DECIMAL_ALPHA_ROMAN" };
const PARAGRAPH_RESET = "namedStyleType,alignment,indentStart,indentFirstLine,keepWithNext,shading,borderLeft,spaceAbove,spaceBelow";
const TEXT_RESET = "bold,italic,underline,strikethrough,smallCaps,baselineOffset,link,foregroundColor,backgroundColor,fontSize,weightedFontFamily";
const GENERIC_FONTS = new Set(["system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "sans-serif", "serif", "monospace", "-apple-system", "blinkmacsystemfont", "segoe ui", "helvetica neue", "helvetica", "cursive", "fantasy", "emoji", "math", "fangsong", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono", "courier new"]);

export const pt = (magnitude) => ({ magnitude, unit: "PT" });

export function rgb(hexColor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hexColor || "");
  if (!m) return null;
  const n = (i) => parseInt(m[1].slice(i * 2, i * 2 + 2), 16) / 255;
  return { color: { rgbColor: { red: n(0), green: n(1), blue: n(2) } } };
}

/** The first family of a CSS font stack that is not a generic or system font. */
export function fontFamily(stack) {
  for (const raw of String(stack || "").split(",")) {
    const name = raw.trim().replace(/^["']|["']$/g, "");
    if (name && !GENERIC_FONTS.has(name.toLowerCase()) && !name.startsWith("var(")) return name;
  }
  return null;
}

export function textStyleOf(run, fonts) {
  const style = {};
  if (run.bold) style.bold = true;
  if (run.italic) style.italic = true;
  if (run.underline) style.underline = true;
  if (run.strike) style.strikethrough = true;
  if (run.smallCaps) style.smallCaps = true;
  if (run.sup) style.baselineOffset = "SUPERSCRIPT";
  if (run.sub) style.baselineOffset = "SUBSCRIPT";
  if (run.link) style.link = { url: run.link };
  if (run.color && rgb(run.color)) style.foregroundColor = rgb(run.color);
  if (run.bg && rgb(run.bg)) style.backgroundColor = rgb(run.bg);
  if (run.size) style.fontSize = pt(run.size);
  else if (run.small) style.fontSize = pt(9);
  if (run.code) style.weightedFontFamily = { fontFamily: fonts.mono || "Roboto Mono" };
  return style;
}

const borderOf = (color) => ({ color: rgb(color), width: pt(2.25), padding: pt(6), dashStyle: "SOLID" });

function paragraphStyleOf(block, palette) {
  const style = { namedStyleType: block.style || "NORMAL_TEXT" };
  if (block.align) style.alignment = block.align;
  if (block.indent) { style.indentStart = pt(block.indent); style.indentFirstLine = pt(block.indent); }
  if (block.keepWithNext) style.keepWithNext = true;
  if (block.shade && rgb(block.shade)) style.shading = { backgroundColor: rgb(block.shade) };
  if (block.border && rgb(block.border)) style.borderLeft = borderOf(block.border);
  if (block.shade || block.border) { style.indentStart = pt((block.indent || 0) + 8); style.indentFirstLine = pt((block.indent || 0) + 8); }
  return style;
}

/**
 * Emit requests for `blocks` inserted at `cursor` (the start of an existing paragraph, before
 * which everything goes). Options:
 * - prevNewline: the character at cursor - 1 is the newline of a body paragraph (so a leading
 *   table can be attached to it without leaving an empty paragraph);
 * - images: Map key -> {uri, width, height} (points), for image blocks;
 * - reset: reset inherited text styles on inserted text (edits into an existing Doc);
 * - suggest: the requests will be sent in suggestion mode (deletions keep their text);
 * - palette, fonts.
 * Returns {requests, end, ranges: [{name, start, end}], links: [{start, end, anchor}]}.
 */
export function emitBlocks(blocks, { cursor, prevNewline = false, images = new Map(), reset = false, suggest = false, palette, fonts = {} }) {
  const requests = [];
  const ranges = [];
  const links = [];
  const open = new Map();
  let cur = cursor;
  let prevNL = prevNewline;
  let prevOwn = false; // the paragraph before cur was inserted by this call
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "p" || block.type === "open" || block.type === "close") {
      let j = i;
      while (j < blocks.length && ["p", "open", "close"].includes(blocks[j].type)) j++;
      const segment = blocks.slice(i, j);
      const result = paragraphs(segment.filter((b) => b.type === "p"), cur, { requests, palette, fonts, reset, links, cell: false });
      // Markers sit between paragraphs: resolve them to the paragraph starts after tab removal.
      let k = 0;
      for (const item of segment) {
        if (item.type === "p") { k++; continue; }
        const at = k < result.starts.length ? result.starts[k] : result.end;
        if (item.type === "open") open.set(item.name, at);
        else if (open.has(item.name)) { ranges.push({ name: item.name, start: open.get(item.name), end: at }); open.delete(item.name); }
      }
      // A table attached to a list item or a shaded paragraph would take its indent.
      const lastP = segment.filter((b) => b.type === "p").at(-1);
      if (result.starts.length) { prevNL = !(lastP.list || lastP.listBody || lastP.indent || lastP.shade || lastP.border); prevOwn = true; }
      cur = result.end;
      i = j;
      continue;
    }
    if (block.type === "image") {
      const image = images.get(block.key);
      if (!image) { i++; continue; }
      requests.push({ insertText: { location: { index: cur }, text: "\n" } });
      requests.push(imageRequest(image, cur));
      requests.push({ updateParagraphStyle: { range: { startIndex: cur, endIndex: cur + 2 }, paragraphStyle: { namedStyleType: "NORMAL_TEXT", alignment: block.align || "CENTER", keepWithNext: true }, fields: PARAGRAPH_RESET } });
      cur += 2;
      prevNL = true;
      prevOwn = true;
      i++;
      continue;
    }
    if (block.type === "table") {
      const at = prevNL ? cur - 1 : cur;
      const T = at + 1;
      const R = block.rows.length;
      const C = block.rows[0].length;
      requests.push({ insertTable: { rows: R, columns: C, location: { index: at } } });
      // Unattached, Docs leaves an empty paragraph before the table that copied the style of
      // the paragraph it split: make it plain.
      if (!prevNL) requests.push({ updateParagraphStyle: { range: { startIndex: at, endIndex: at + 1 }, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: PARAGRAPH_RESET } }, { deleteParagraphBullets: { range: { startIndex: at, endIndex: at + 1 } } });
      let added = 0;
      let firstCell = 0;
      for (let r = R - 1; r >= 0; r--) {
        for (let c = C - 1; c >= 0; c--) {
          const cellAt = T + 3 + r * (1 + 2 * C) + 2 * c;
          const filled = cellFlow(block.rows[r][c].blocks, cellAt, { requests, palette, fonts, reset, links, images });
          added += filled;
          if (r === 0 && c === 0) firstCell = filled;
        }
      }
      const L = 2 + R * (1 + 2 * C) + added;
      tableStyles(block, T, R, C, requests, palette);
      if (block.answerOf) ranges.push({ name: `k_${block.answerOf}_answer`, start: T + 3, end: T + 3 + firstCell });
      if (prevNL) {
        // As a suggestion, deleting a newline that was already there only marks it (it stays
        // until accepted); one this batch inserted as a suggestion goes at once.
        requests.push({ deleteContentRange: { range: { startIndex: T + L, endIndex: T + L + 1 } } });
        cur = suggest && !prevOwn ? T + L + 1 : T + L;
      } else cur = T + L;
      prevNL = false;
      prevOwn = false;
      i++;
      continue;
    }
    i++;
  }
  for (const [name, start] of open) ranges.push({ name, start, end: cur });
  return { requests, end: cur, ranges, links };
}

function imageRequest(image, index) {
  const width = Math.min(CONTENT_WIDTH, image.width || CONTENT_WIDTH);
  return { insertInlineImage: { location: { index }, uri: image.uri, objectSize: { width: pt(Math.round(width * 100) / 100) } } };
}

/**
 * Insert consecutive paragraphs at `at` with one insertText. With `cell`, the last paragraph
 * takes over the newline already there (a table cell always ends with one).
 */
function paragraphs(list, at, { requests, palette, fonts, reset, links, cell }) {
  if (!list.length) return { starts: [], end: at, length: 0 };
  const texts = list.map((p) => {
    let text = runsText(p.runs);
    if (!p.list && text.startsWith("\t")) text = text.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));
    return text;
  });
  const tabs = list.map((p) => (p.list ? p.list.level : 0));
  const full = list.map((p, n) => "\t".repeat(tabs[n]) + texts[n]);
  const inserted = cell ? full.join("\n") : full.map((t) => `${t}\n`).join("");
  if (inserted) requests.push({ insertText: { location: { index: at }, text: inserted } });
  // Text typed into an existing list item joins its list. Clearing that comes first: it
  // indents the paragraphs, which the paragraph styles below then reset.
  if (reset && inserted) requests.push({ deleteParagraphBullets: { range: { startIndex: at, endIndex: at + inserted.length } } });
  // Pre-removal positions (with the nesting tabs still in place).
  const preStarts = [];
  let pos = at;
  for (const text of full) { preStarts.push(pos); pos += text.length + 1; }
  for (let n = 0; n < list.length; n++) {
    const style = paragraphStyleOf(list[n], palette);
    // A shaded box (callout, recommendation, code) gets air above and below, not inside.
    if (list[n].box) {
      if (list[n - 1]?.box !== list[n].box) style.spaceAbove = pt(6);
      if (list[n + 1]?.box !== list[n].box) style.spaceBelow = pt(6);
    }
    requests.push({ updateParagraphStyle: { range: { startIndex: preStarts[n], endIndex: preStarts[n] + full[n].length + 1 }, paragraphStyle: style, fields: PARAGRAPH_RESET } });
  }
  // List groups: items plus the body paragraphs between them, bulleted together (so numbering
  // runs on), then the bodies lose their bullets again.
  const groups = [];
  for (let n = 0; n < list.length; n++) {
    const id = list[n].list?.group;
    if (!id) continue;
    const last = groups.at(-1);
    if (last && last.id === id) last.to = n;
    else groups.push({ id, kind: list[n].list.kind, from: n, to: n });
  }
  for (const group of [...groups].reverse()) {
    requests.push({ createParagraphBullets: { range: { startIndex: preStarts[group.from], endIndex: preStarts[group.to] + full[group.to].length }, bulletPreset: PRESETS[group.kind] || PRESETS.bullet } });
  }
  const starts = [];
  let removed = 0;
  for (let n = 0; n < list.length; n++) {
    const inGroup = groups.some((g) => n >= g.from && n <= g.to);
    starts.push(preStarts[n] - removed);
    if (inGroup) removed += tabs[n];
  }
  const length = (n) => texts[n].length + 1;
  for (const group of groups) {
    for (let n = group.from; n <= group.to; n++) {
      if (list[n].list) continue;
      requests.push({ deleteParagraphBullets: { range: { startIndex: starts[n], endIndex: starts[n] + length(n) } } });
      requests.push({ updateParagraphStyle: { range: { startIndex: starts[n], endIndex: starts[n] + length(n) }, paragraphStyle: { indentStart: pt(36), indentFirstLine: pt(36) }, fields: "indentStart,indentFirstLine" } });
    }
  }
  for (let n = 0; n < list.length; n++) {
    const start = starts[n];
    if (reset && texts[n].length) requests.push({ updateTextStyle: { range: { startIndex: start, endIndex: start + texts[n].length }, textStyle: {}, fields: TEXT_RESET } });
    let offset = start;
    for (const run of list[n].runs) {
      const style = textStyleOf(list[n].color && !run.color ? { ...run, color: list[n].color } : run, fonts);
      const fields = Object.keys(style);
      if (fields.length) requests.push({ updateTextStyle: { range: { startIndex: offset, endIndex: offset + run.text.length }, textStyle: style, fields: fields.join(",") } });
      if (run.anchor) links.push({ start: offset, end: offset + run.text.length, anchor: run.anchor });
      offset += run.text.length;
    }
  }
  const total = list.reduce((sum, _, n) => sum + length(n), 0) - (cell ? 1 : 0);
  return { starts, end: at + total, length: total };
}

/** Fill one table cell at its (empty) paragraph; returns the characters added. */
function cellFlow(blocks, at, options) {
  let cur = at;
  let added = 0;
  const content = blocks.filter((b) => b.type === "p" || b.type === "image");
  for (let i = 0; i < content.length;) {
    const block = content[i];
    if (block.type === "image") {
      const image = options.images.get(block.key);
      const last = i === content.length - 1;
      if (image) {
        if (!last) options.requests.push({ insertText: { location: { index: cur }, text: "\n" } });
        options.requests.push(imageRequest(image, cur));
        options.requests.push({ updateParagraphStyle: { range: { startIndex: cur, endIndex: cur + 2 }, paragraphStyle: { namedStyleType: "NORMAL_TEXT", alignment: "CENTER" }, fields: PARAGRAPH_RESET } });
        const grew = last ? 1 : 2;
        cur += grew;
        added += grew;
      }
      i++;
      continue;
    }
    let j = i;
    while (j < content.length && content[j].type === "p") j++;
    const last = j === content.length;
    const result = paragraphs(content.slice(i, j), cur, { ...options, cell: last });
    cur = result.end;
    added += result.length;
    i = j;
  }
  return added;
}

function tableStyles(block, T, R, C, requests, palette) {
  const line = block.border || palette.line;
  const border = { color: rgb(line), width: pt(0.75), dashStyle: "SOLID" };
  requests.push({ updateTableCellStyle: { tableStartLocation: { index: T }, tableCellStyle: { borderTop: border, borderBottom: border, borderLeft: border, borderRight: border, paddingTop: pt(5), paddingBottom: pt(5), paddingLeft: pt(7), paddingRight: pt(7) }, fields: "borderTop,borderBottom,borderLeft,borderRight,paddingTop,paddingBottom,paddingLeft,paddingRight" } });
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const bg = block.rows[r][c].bg;
      if (bg && rgb(bg) && bg !== palette.surface) {
        requests.push({ updateTableCellStyle: { tableRange: { tableCellLocation: { tableStartLocation: { index: T }, rowIndex: r, columnIndex: c }, rowSpan: 1, columnSpan: 1 }, tableCellStyle: { backgroundColor: rgb(bg) }, fields: "backgroundColor" } });
      }
    }
  }
  (block.widths || []).forEach((width, column) => {
    if (width) requests.push({ updateTableColumnProperties: { tableStartLocation: { index: T }, columnIndices: [column], tableColumnProperties: { widthType: "FIXED_WIDTH", width: pt(width) }, fields: "widthType,width" } });
  });
  if (block.header && R > 1) requests.push({ pinTableHeaderRows: { tableStartLocation: { index: T }, pinnedHeaderRowsCount: block.headerRows || 1 } });
}

/** Named styles for a branded Doc: fonts and colours of the body, title, and headings. */
export function namedStyleRequests(palette, fonts) {
  const requests = [];
  const set = (type, style) => {
    const fields = Object.keys(style).map((k) => `textStyle.${k}`);
    if (fields.length) requests.push({ updateNamedStyle: { namedStyle: { namedStyleType: type, textStyle: style }, fields: ["namedStyleType", ...fields].join(",") } });
  };
  const family = (name, weight) => (name ? { weightedFontFamily: { fontFamily: name, ...(weight ? { weight } : {}) } } : {});
  set("NORMAL_TEXT", { ...family(fonts.body), foregroundColor: rgb(palette.ink) });
  set("TITLE", { ...family(fonts.heading || fonts.body, 700), foregroundColor: rgb(palette.ink) });
  set("SUBTITLE", { ...family(fonts.body), foregroundColor: rgb(palette.muted) });
  for (const type of ["HEADING_1", "HEADING_2", "HEADING_3", "HEADING_4"]) set(type, { ...family(fonts.heading || fonts.body, 600), foregroundColor: rgb(palette.ink) });
  return requests;
}

/** Split requests into batches small enough for one command line and one API call. */
export function chunkRequests(requests, { maxCount = 400, maxBytes = 400_000 } = {}) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const request of requests) {
    const size = JSON.stringify(request).length;
    if (current.length && (current.length >= maxCount || bytes + size > maxBytes)) { batches.push(current); current = []; bytes = 0; }
    current.push(request);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}
