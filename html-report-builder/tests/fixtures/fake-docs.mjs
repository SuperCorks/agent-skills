// In-memory stand-in for one Google Doc, applying batchUpdate requests with the index rules the
// real API showed in the 2026-10-26 spike, and refusing what it refuses (deleting the newline
// before a table, cutting a table in half, named ranges in suggestion mode, data: image URIs).
// documents.get output follows the includeTabsContent shape, so the reader is tested on it.

const clone = (value) => JSON.parse(JSON.stringify(value));

export class FakeDoc {
  constructor({ id = "doc1", title = "Untitled" } = {}) {
    this.id = id;
    this.title = title;
    this.units = [this.newline({ namedStyleType: "NORMAL_TEXT" })];
    this.revision = 1;
    this.namedRanges = [];
    this.comments = [];
    this.suggestions = new Map();
    this.namedStyles = {};
    this.tables = new Map(); // table token uid -> {cellStyles, pinned, columns}
    this.headers = {};
    this.seq = 0;
  }

  uid() { return ++this.seq; }
  newline(ps = {}, bullet = null) { return { t: "c", ch: "\n", ts: {}, ps: { ...ps }, bullet, uid: this.uid() }; }
  get revisionId() { return `rev${this.revision}`; }
  get length() { return this.units.length; } // body indices run 1..length

  unit(index) { return this.units[index - 1]; }

  // ---------- structure helpers ----------
  /** The paragraph newline unit index (1-based) that ends the paragraph containing `index`. */
  paragraphEnd(index) {
    for (let i = index; i <= this.length; i++) {
      const u = this.unit(i);
      if (u.t !== "c" && u.t !== "img") throw new Error(`index ${index} is not inside a paragraph`);
      if (u.t === "c" && u.ch === "\n") return i;
    }
    throw new Error(`index ${index} is past the end of the body`);
  }

  paragraphStart(index) {
    let i = index;
    while (i > 1) {
      const u = this.unit(i - 1);
      if (u.t !== "c" && u.t !== "img") break;
      if (u.t === "c" && u.ch === "\n") break;
      i--;
    }
    return i;
  }

  assertInParagraph(index) {
    if (!Number.isInteger(index) || index < 1 || index > this.length) throw new Error(`Invalid location index ${index}`);
    const u = this.unit(index);
    if (u.t !== "c" && u.t !== "img") throw new Error(`The insertion index ${index} must be inside the bounds of an existing paragraph`);
  }

  tableAt(index) {
    const u = this.unit(index);
    if (!u || u.t !== "ts") throw new Error(`no table starts at ${index}`);
    let end = index;
    let depth = 0;
    for (let i = index; i <= this.length; i++) {
      const t = this.unit(i).t;
      if (t === "ts") depth++;
      if (t === "te") { depth--; if (depth === 0) { end = i; break; } }
    }
    return { start: index, end, token: u };
  }

  // ---------- range bookkeeping ----------
  shiftInsert(at, n) {
    const adjust = (r) => {
      if (at <= r.start) { r.start += n; r.end += n; } else if (at < r.end) r.end += n;
    };
    for (const nr of this.namedRanges) adjust(nr);
    for (const c of this.comments) if (c.anchor) adjust(c.anchor);
  }

  shiftDelete(a, b) {
    const n = b - a;
    const move = (v) => (v >= b ? v - n : v > a ? a : v);
    for (const nr of this.namedRanges) { nr.start = move(nr.start); nr.end = move(nr.end); }
    this.namedRanges = this.namedRanges.filter((nr) => nr.end > nr.start);
    for (const c of this.comments) if (c.anchor) { c.anchor.start = move(c.anchor.start); c.anchor.end = move(c.anchor.end); if (c.anchor.end <= c.anchor.start) c.anchor = null; }
  }

  insertUnits(at, units, suggestion) {
    if (suggestion) for (const u of units) u.sug = { ins: suggestion };
    this.units.splice(at - 1, 0, ...units);
    this.shiftInsert(at, units.length);
  }

  // ---------- requests ----------
  batchUpdate({ requests = [], writeControl = {} } = {}) {
    if (writeControl.requiredRevisionId && writeControl.requiredRevisionId !== this.revisionId) throw new Error(`The required revision ID '${writeControl.requiredRevisionId}' does not match the latest revision`);
    const suggest = writeControl.writeMode === "SUGGEST";
    const before = clone({ units: this.units, namedRanges: this.namedRanges, comments: this.comments, tables: [...this.tables], seq: this.seq, suggestions: [...this.suggestions] });
    const suggestion = suggest ? `suggest.${this.revision + 1}` : null;
    const replies = [];
    try {
      for (const [n, request] of requests.entries()) {
        const [kind, body] = Object.entries(request)[0];
        if (suggest && ["createNamedRange", "deleteNamedRange", "replaceNamedRangeContent", "insertComment", "addCommentReply"].includes(kind)) throw new Error(`Invalid requests[${n}].${kind}: Request does not support application as suggestion.`);
        if (!this[`op_${kind}`]) throw new Error(`fake Docs does not model ${kind}`);
        replies.push(this[`op_${kind}`](body, { suggestion }) || {});
      }
    } catch (error) {
      Object.assign(this, { units: before.units, namedRanges: before.namedRanges, comments: before.comments, tables: new Map(before.tables), seq: before.seq, suggestions: new Map(before.suggestions) });
      throw error;
    }
    if (suggestion && [...this.units].some((u) => u.sug && (u.sug.ins === suggestion || u.sug.del === suggestion))) this.suggestions.set(suggestion, { status: "OPEN" });
    this.revision++;
    return { documentId: this.id, replies, writeControl: { requiredRevisionId: this.revisionId } };
  }

  op_insertText({ location, endOfSegmentLocation, text }, { suggestion }) {
    const at = location ? location.index : this.length;
    this.assertInParagraph(at);
    const end = this.paragraphEnd(at);
    const prev = at > 1 ? this.unit(at - 1) : null;
    const inherit = prev && prev.t === "c" && prev.ch !== "\n" ? prev.ts : this.unit(at).t === "c" && this.unit(at).ch !== "\n" ? this.unit(at).ts : {};
    const nl = this.unit(end);
    // Indices count UTF-16 code units, like the API (a code point above U+FFFF takes two).
    const units = text.split("").map((ch) => (ch === "\n" ? this.newline(nl.ps, nl.bullet) : { t: "c", ch, ts: { ...inherit } }));
    this.insertUnits(at, units, suggestion);
  }

  op_deleteContentRange({ range }, { suggestion }) {
    const { startIndex: a, endIndex: b } = range;
    if (!(a >= 1 && b > a && b <= this.length + 1)) throw new Error("Invalid deletion range");
    if (b > this.length) throw new Error("Invalid deletion range. Cannot delete the requested range. (the final newline of the body)");
    // Whole tables only, never the newline right before a kept table, never a cell's last newline.
    for (let i = a; i < b; i++) {
      const u = this.unit(i);
      if (u.t === "ts") { const t = this.tableAt(i); if (t.end >= b) throw new Error("Invalid deletion range. Cannot delete the requested range. (partial table)"); i = t.end; continue; }
      if (u.t === "rs" || u.t === "cs" || u.t === "te") throw new Error("Invalid deletion range. Cannot delete the requested range. (table structure)");
      if (u.t === "c" && u.ch === "\n") {
        const next = this.unit(i + 1);
        if (next && next.t === "ts" && this.tableAt(i + 1).end >= b) throw new Error("Invalid deletion range. Cannot delete the requested range. (newline before a table)");
        if (next && (next.t === "cs" || next.t === "rs" || next.t === "te")) throw new Error("Invalid deletion range. Cannot delete the requested range. (last newline of a cell)");
      }
    }
    if (suggestion) {
      // Text this suggestion inserted is removed outright; anything else is only marked.
      for (let i = b - 1; i >= a; i--) {
        const u = this.unit(i);
        if (u.sug?.ins === suggestion) { this.units.splice(i - 1, 1); this.shiftDelete(i, i + 1); } else u.sug = { ...(u.sug || {}), del: suggestion };
      }
      return;
    }
    this.units.splice(a - 1, b - a);
    this.shiftDelete(a, b);
  }

  paragraphsIn(a, b) {
    const ends = [];
    for (let i = a; i <= Math.min(this.length, Math.max(a, b - 1)); i++) {
      const u = this.unit(i);
      if (u.t === "c" && u.ch === "\n") ends.push(i);
    }
    // A range ending mid-paragraph still touches that paragraph.
    const last = Math.min(this.length, Math.max(a, b - 1));
    const lu = this.unit(last);
    if ((lu.t === "c" || lu.t === "img") && !(lu.t === "c" && lu.ch === "\n")) { const e = this.paragraphEnd(last); if (!ends.includes(e)) ends.push(e); }
    return ends;
  }

  op_updateParagraphStyle({ range, paragraphStyle = {}, fields }) {
    for (const end of this.paragraphsIn(range.startIndex, range.endIndex)) {
      const nl = this.unit(end);
      for (const field of fields.split(",")) {
        if (field in paragraphStyle) nl.ps[field] = clone(paragraphStyle[field]);
        else delete nl.ps[field];
      }
    }
  }

  op_updateTextStyle({ range, textStyle = {}, fields }) {
    if (!(range.endIndex > range.startIndex)) throw new Error("Invalid range");
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const u = this.unit(i);
      if (!u || u.t !== "c" || u.ch === "\n") continue;
      for (const field of fields.split(",")) {
        if (field in textStyle) u.ts[field] = clone(textStyle[field]);
        else delete u.ts[field];
      }
    }
  }

  op_createParagraphBullets({ range }) {
    const listId = `kix.list${this.uid()}`;
    const ends = this.paragraphsIn(range.startIndex, range.endIndex);
    // Process from the end so earlier indices hold while tabs are removed.
    for (const end of [...ends].reverse()) {
      const start = this.paragraphStart(end);
      let tabs = 0;
      while (this.unit(start + tabs).t === "c" && this.unit(start + tabs).ch === "\t") tabs++;
      if (tabs) { this.units.splice(start - 1, tabs); this.shiftDelete(start, start + tabs); }
      const nl = this.unit(end - tabs);
      nl.bullet = { listId, ...(tabs ? { nestingLevel: tabs } : {}) };
    }
  }

  op_deleteParagraphBullets({ range }) {
    for (const end of this.paragraphsIn(range.startIndex, range.endIndex)) this.unit(end).bullet = null;
  }

  op_insertTable({ rows, columns, location }, { suggestion }) {
    this.assertInParagraph(location.index);
    const nl = this.unit(this.paragraphEnd(location.index));
    const ts = { t: "ts", rows, columns, uid: this.uid() };
    const units = [this.newline(nl.ps, nl.bullet), ts];
    for (let r = 0; r < rows; r++) {
      units.push({ t: "rs", uid: this.uid() });
      for (let c = 0; c < columns; c++) units.push({ t: "cs", uid: this.uid() }, this.newline({ namedStyleType: "NORMAL_TEXT" }));
    }
    units.push({ t: "te", uid: this.uid() });
    this.tables.set(ts.uid, { cellStyles: {}, pinned: 0, columns: {} });
    this.insertUnits(location.index, units, suggestion);
  }

  op_updateTableCellStyle({ tableStartLocation, tableRange, tableCellStyle, fields }) {
    const location = tableRange ? tableRange.tableCellLocation.tableStartLocation : tableStartLocation;
    const table = this.tables.get(this.tableAt(location.index).token.uid);
    const key = tableRange ? `${tableRange.tableCellLocation.rowIndex},${tableRange.tableCellLocation.columnIndex}` : "*";
    table.cellStyles[key] = { ...(table.cellStyles[key] || {}), ...Object.fromEntries(fields.split(",").map((f) => [f, tableCellStyle[f]])) };
  }

  op_updateTableColumnProperties({ tableStartLocation, columnIndices, tableColumnProperties }) {
    const table = this.tables.get(this.tableAt(tableStartLocation.index).token.uid);
    for (const c of columnIndices || []) table.columns[c] = clone(tableColumnProperties);
  }

  op_pinTableHeaderRows({ tableStartLocation, pinnedHeaderRowsCount }) {
    this.tables.get(this.tableAt(tableStartLocation.index).token.uid).pinned = pinnedHeaderRowsCount;
  }

  op_insertInlineImage({ location, uri, objectSize }, { suggestion }) {
    if (!/^https?:\/\//.test(uri) || uri.length > 2048) throw new Error("Invalid requests[0].insertInlineImage: The URL must be 2K bytes or less.");
    this.assertInParagraph(location.index);
    const id = `kix.img${this.uid()}`;
    this.insertUnits(location.index, [{ t: "img", id, uri, size: clone(objectSize || {}) }], suggestion);
    return { insertInlineImage: { objectId: id } };
  }

  op_replaceImage({ imageObjectId, uri }) {
    const u = this.units.find((x) => x.t === "img" && x.id === imageObjectId);
    if (!u) throw new Error(`no image ${imageObjectId}`);
    u.uri = uri;
  }

  op_createNamedRange({ name, range }) {
    if (!(range.endIndex > range.startIndex) || range.endIndex > this.length + 1) throw new Error(`Invalid named range ${name}`);
    const id = `kix.nr${this.uid()}`;
    this.namedRanges.push({ id, name, start: range.startIndex, end: range.endIndex });
    return { createNamedRange: { namedRangeId: id } };
  }

  op_deleteNamedRange({ name, namedRangeId }) {
    const keep = this.namedRanges.filter((r) => (name ? r.name !== name : r.id !== namedRangeId));
    if (keep.length === this.namedRanges.length) throw new Error(`Invalid requests.deleteNamedRange: No named range with name: ${name || namedRangeId}`);
    this.namedRanges = keep;
  }

  op_replaceNamedRangeContent({ namedRangeName, namedRangeId, text }, ctx) {
    const range = this.namedRanges.find((r) => (namedRangeName ? r.name === namedRangeName : r.id === namedRangeId));
    if (!range) throw new Error(`no named range ${namedRangeName || namedRangeId}`);
    const { start, end } = range;
    this.op_insertText({ location: { index: end }, text }, ctx);
    this.op_deleteContentRange({ range: { startIndex: start, endIndex: end } }, ctx);
    range.start = start;
    range.end = start + text.length;
    if (!this.namedRanges.includes(range)) this.namedRanges.push(range);
  }

  op_updateNamedStyle({ namedStyle, fields }) {
    if (!fields.split(",").includes("namedStyleType")) throw new Error("Named style type is required.");
    this.namedStyles[namedStyle.namedStyleType] = clone(namedStyle);
  }

  op_updateDocumentStyle() {}

  op_createHeader() {
    const id = `kix.header${this.uid()}`;
    this.headers[id] = [];
    return { createHeader: { headerId: id } };
  }

  op_insertComment({ range, content }) {
    const id = `doco.c${this.uid()}`;
    const quote = this.textBetween(range.startIndex, range.endIndex);
    this.comments.push({ id, anchorId: `kix.a${this.uid()}`, anchor: { start: range.startIndex, end: range.endIndex }, quote, content, status: "OPEN", replies: [], author: "Simon Corcos" });
    return { insertComment: { commentThread: { commentId: id } } };
  }

  op_addCommentReply({ commentId, post }) {
    const comment = this.comments.find((c) => c.id === commentId);
    if (!comment) throw new Error(`no comment ${commentId}`);
    if (post.content) comment.replies.push({ content: post.content, author: "Simon Corcos" });
    if (post.commentAction === "RESOLVE") comment.status = "RESOLVED";
    if (post.commentAction === "REOPEN") comment.status = "OPEN";
  }

  op_acceptSuggestion({ suggestionId }) { this.settle(suggestionId, true); }
  op_rejectSuggestion({ suggestionId }) { this.settle(suggestionId, false); }

  settle(id, accept) {
    if (!this.suggestions.has(id)) throw new Error(`no suggestion ${id}`);
    for (let i = this.length; i >= 1; i--) {
      const u = this.unit(i);
      if (!u.sug) continue;
      const drop = (accept && u.sug.del === id) || (!accept && u.sug.ins === id);
      if (drop) { this.units.splice(i - 1, 1); this.shiftDelete(i, i + 1); continue; }
      if (u.sug.ins === id) delete u.sug.ins;
      if (u.sug.del === id) delete u.sug.del;
      if (!u.sug.ins && !u.sug.del) delete u.sug;
    }
    this.suggestions.set(id, { status: accept ? "ACCEPTED" : "REJECTED" });
  }

  /** A client's comment or suggestion, as if typed in the Docs editor by someone else. */
  clientComment(range, content, author = "Raine") {
    this.op_insertComment({ range, content });
    Object.assign(this.comments.at(-1), { author });
    this.revision++;
    return this.comments.at(-1);
  }

  clientSuggest(requests, author = "Raine") {
    const before = this.revision;
    this.batchUpdate({ requests, writeControl: { writeMode: "SUGGEST" } });
    const id = `suggest.${before + 1}`;
    if (this.suggestions.has(id)) this.suggestions.get(id).author = author;
    return id;
  }

  // ---------- reading ----------
  textBetween(a, b) {
    let text = "";
    for (let i = a; i < b; i++) { const u = this.unit(i); if (u.t === "c") text += u.ch; }
    return text;
  }

  /** Plain body text with tables as tab/row separators, for assertions. */
  text() {
    return this.units.map((u) => (u.t === "c" ? u.ch : u.t === "img" ? "[img]" : u.t === "cs" ? "|" : u.t === "te" ? "]" : u.t === "ts" ? "[" : "")).join("");
  }

  get(params = {}) {
    const content = [{ endIndex: 1, sectionBreak: { sectionStyle: {} } }];
    const paragraphAt = (startIdx) => {
      const elements = [];
      let i = startIdx;
      let run = null;
      for (; ; i++) {
        const u = this.unit(i);
        const sugKey = JSON.stringify(u.sug || null);
        if (u.t === "img") {
          run = null;
          elements.push({ startIndex: i, endIndex: i + 1, inlineObjectElement: { inlineObjectId: u.id, textStyle: {}, ...(u.sug?.ins ? { suggestedInsertionIds: [u.sug.ins] } : {}) } });
        } else {
          const key = JSON.stringify(u.ts) + sugKey;
          if (run && run.key === key) { run.el.textRun.content += u.ch; run.el.endIndex = i + 1; }
          else {
            const textRun = { content: u.ch, textStyle: clone(u.ts) };
            if (u.sug?.ins) textRun.suggestedInsertionIds = [u.sug.ins];
            if (u.sug?.del) textRun.suggestedDeletionIds = [u.sug.del];
            run = { key, el: { startIndex: i, endIndex: i + 1, textRun } };
            elements.push(run.el);
          }
        }
        if (u.t === "c" && u.ch === "\n") {
          const ps = clone(u.ps);
          if (/^HEADING_|^TITLE$|^SUBTITLE$/.test(ps.namedStyleType || "")) ps.headingId = `h.${u.uid}`;
          return { el: { startIndex: startIdx, endIndex: i + 1, paragraph: { elements, paragraphStyle: ps, ...(u.bullet ? { bullet: clone(u.bullet) } : {}) } }, next: i + 1 };
        }
      }
    };
    const walk = (from, to, into) => {
      let i = from;
      while (i < to) {
        const u = this.unit(i);
        if (u.t === "ts") {
          const t = this.tableAt(i);
          const meta = this.tables.get(u.uid) || { cellStyles: {} };
          const tableRows = [];
          let j = i + 1;
          for (let r = 0; r < u.rows; r++) {
            const rowStart = j;
            j++;
            const tableCells = [];
            for (let c = 0; c < u.columns; c++) {
              const cellStart = j;
              j++;
              let k = j;
              while (this.unit(k).t !== "cs" && this.unit(k).t !== "rs" && this.unit(k).t !== "te") {
                if (this.unit(k).t === "ts") k = this.tableAt(k).end + 1; else k++;
              }
              const cellContent = [];
              walk(j, k, cellContent);
              tableCells.push({ startIndex: cellStart, endIndex: k, content: cellContent, tableCellStyle: { ...(meta.cellStyles["*"] || {}), ...(meta.cellStyles[`${r},${c}`] || {}) } });
              j = k;
            }
            tableRows.push({ startIndex: rowStart, endIndex: j, tableCells });
          }
          into.push({ startIndex: i, endIndex: t.end + 1, table: { rows: u.rows, columns: u.columns, tableRows, ...(u.sug?.ins ? { suggestedInsertionIds: [u.sug.ins] } : {}) } });
          i = t.end + 1;
          continue;
        }
        const { el, next } = paragraphAt(i);
        into.push(el);
        i = next;
      }
    };
    walk(1, this.length + 1, content);
    const namedRanges = {};
    for (const nr of this.namedRanges) {
      namedRanges[nr.name] ||= { name: nr.name, namedRanges: [] };
      namedRanges[nr.name].namedRanges.push({ namedRangeId: nr.id, name: nr.name, ranges: [{ startIndex: nr.start, endIndex: nr.end, tabId: "t.0" }] });
    }
    const inlineObjects = Object.fromEntries(this.units.filter((u) => u.t === "img").map((u) => [u.id, { objectId: u.id, inlineObjectProperties: { embeddedObject: { imageProperties: { contentUri: `https://docs.google.com/docs-images-rt/${u.id}` }, size: u.size } } }]));
    const documentTab = { body: { content }, namedRanges, inlineObjects, headers: clone(this.headers) };
    const result = { documentId: this.id, title: this.title, revisionId: this.revisionId, tabs: [{ tabProperties: { tabId: "t.0", title: "Tab 1", index: 0 }, documentTab }] };
    if (params.commentsViewMode === "COMMENTS_VIEW_MODE_INCLUDED") {
      documentTab.commentAnchors = Object.fromEntries(this.comments.filter((c) => c.anchor).map((c) => [c.anchorId, { anchorId: c.anchorId, ranges: [{ startIndex: c.anchor.start, endIndex: c.anchor.end, tabId: "t.0" }] }]));
      result.comments = this.comments.map((c) => ({
        commentId: c.id, anchorId: c.anchorId, plainTextQuote: c.quote, status: c.status,
        headPost: { postId: c.id, content: c.content, author: { displayName: c.author, me: c.author === "Simon Corcos" } },
        replies: c.replies.map((r, n) => ({ postId: `${c.id}.r${n}`, content: r.content, author: { displayName: r.author, me: r.author === "Simon Corcos" } })),
      }));
      result.suggestions = [...this.suggestions].map(([id, s]) => ({ suggestionId: id, status: s.status, summaryText: this.summary(id), headPost: { author: { displayName: s.author || "Simon Corcos", me: !s.author } } }));
    }
    return clone(result);
  }

  summary(id) {
    let ins = "";
    let del = "";
    for (const u of this.units) { if (u.t !== "c") continue; if (u.sug?.ins === id) ins += u.ch; if (u.sug?.del === id) del += u.ch; }
    if (ins && del) return `Replace: “${del}” with “${ins}”`;
    if (ins) return `Add: “${ins}”`;
    if (del) return `Delete: “${del}”`;
    return "";
  }
}
