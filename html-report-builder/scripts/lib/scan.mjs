// Zero-dependency HTML tokenizer and tree builder that keeps exact source offsets.
// Concatenating every token's source slice reproduces the input byte for byte, so
// callers can splice one element's range and leave every other byte untouched.

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

// Elements whose content is not parsed for tags (raw text and RCDATA).
const RAW_CONTENT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);

// Opening one of these closes an open <p> in button scope.
const P_CLOSERS = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog", "dir", "div", "dl",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "li", "dd", "dt", "listing", "main", "menu", "nav", "ol", "p", "pre",
  "search", "section", "summary", "table", "ul", "xmp", "plaintext"
]);
const SCOPE_BOUNDARIES = new Set([
  "applet", "caption", "html", "table", "td", "th", "marquee", "object", "template", "svg", "math"
]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const isWs = (c) => c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
const isAlpha = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

function parseTag(source, lt, isEnd) {
  const n = source.length;
  let j = lt + (isEnd ? 2 : 1);
  const nameStart = j;
  while (j < n && !isWs(source[j]) && source[j] !== "/" && source[j] !== ">") j++;
  const name = source.slice(nameStart, j).toLowerCase();
  const attrs = [];
  let selfClosing = false;
  let terminated = false;
  while (j < n) {
    const c = source[j];
    if (isWs(c)) { j++; continue; }
    if (c === "/") {
      if (source[j + 1] === ">") { selfClosing = true; j += 2; terminated = true; break; }
      j++;
      continue;
    }
    if (c === ">") { j++; terminated = true; break; }
    const attrStart = j;
    j++;
    while (j < n && !isWs(source[j]) && source[j] !== "/" && source[j] !== ">" && source[j] !== "=") j++;
    const attr = { name: source.slice(attrStart, j).toLowerCase(), start: attrStart, end: j, value: "", valueStart: -1, valueEnd: -1, quote: "" };
    let k = j;
    while (k < n && isWs(source[k])) k++;
    if (source[k] === "=") {
      k++;
      while (k < n && isWs(source[k])) k++;
      const q = source[k];
      if (q === '"' || q === "'") {
        const close = source.indexOf(q, k + 1);
        attr.quote = q;
        attr.valueStart = k + 1;
        attr.valueEnd = close === -1 ? n : close;
        j = close === -1 ? n : close + 1;
      } else {
        attr.valueStart = k;
        while (k < n && !isWs(source[k]) && source[k] !== ">") k++;
        attr.valueEnd = k;
        j = k;
      }
      attr.value = decodeEntities(source.slice(attr.valueStart, attr.valueEnd));
      attr.end = j;
    }
    attrs.push(attr);
  }
  return { name, attrs, selfClosing, end: j, terminated };
}

/** Split source into contiguous tokens: text, comment, doctype, open, close. */
export function tokenize(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;
  let textStart = 0;
  const pushText = (end, raw = false) => {
    if (end > textStart) tokens.push({ type: "text", start: textStart, end, raw });
  };
  const pushToken = (token) => {
    pushText(token.start);
    tokens.push(token);
    i = textStart = token.end;
  };
  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;
    const next = source[lt + 1];
    if (source.startsWith("<!--", lt)) {
      let end;
      if (source.startsWith("<!-->", lt)) end = lt + 5;
      else if (source.startsWith("<!--->", lt)) end = lt + 6;
      else {
        const close = source.indexOf("-->", lt + 4);
        end = close === -1 ? n : close + 3;
      }
      pushToken({ type: "comment", start: lt, end });
      continue;
    }
    if (next === "!" || next === "?") {
      const close = source.indexOf(">", lt + 2);
      const end = close === -1 ? n : close + 1;
      const doctype = /^<!doctype/i.test(source.slice(lt, lt + 9));
      pushToken({ type: doctype ? "doctype" : "comment", start: lt, end });
      continue;
    }
    if (next === "/") {
      if (isAlpha(source[lt + 2] || "")) {
        const tag = parseTag(source, lt, true);
        pushToken({ type: "close", start: lt, end: tag.end, name: tag.name, attrs: [] });
      } else {
        const close = source.indexOf(">", lt + 2);
        pushToken({ type: "comment", start: lt, end: close === -1 ? n : close + 1, bogus: true });
      }
      continue;
    }
    if (isAlpha(next || "")) {
      const tag = parseTag(source, lt, false);
      pushToken({ type: "open", start: lt, end: tag.end, name: tag.name, attrs: tag.attrs, selfClosing: tag.selfClosing });
      if (RAW_CONTENT.has(tag.name) && tag.terminated) {
        const pattern = new RegExp(`</${tag.name}[\\s/>]`, "ig");
        pattern.lastIndex = i;
        const match = pattern.exec(source);
        const end = match ? match.index : n;
        pushText(end, true);
        i = textStart = end;
      }
      continue;
    }
    i = lt + 1;
  }
  pushText(n);
  return tokens;
}

function closeImplicitly(element, at) {
  element.closeKind = "implicit";
  element.innerEnd = Math.max(element.innerStart, at);
  element.end = Math.max(element.innerEnd, at);
}

function findInScope(stack, names, extraBoundaries = []) {
  for (let i = stack.length - 1; i > 0; i--) {
    const name = stack[i].name;
    if (names.has(name)) return i;
    if (SCOPE_BOUNDARIES.has(name) || extraBoundaries.includes(name)) return -1;
  }
  return -1;
}

function popTo(stack, index, at) {
  while (stack.length > index) closeImplicitly(stack.pop(), at);
}

function applyImplicitCloses(name, stack, at) {
  const top = () => stack[stack.length - 1];
  if (top().foreign) return;
  if (name === "li") {
    const i = findInScope(stack, new Set(["li"]), ["ul", "ol"]);
    if (i > 0) popTo(stack, i, at);
  } else if (name === "dd" || name === "dt") {
    const i = findInScope(stack, new Set(["dd", "dt"]), ["dl"]);
    if (i > 0) popTo(stack, i, at);
  } else if (name === "td" || name === "th") {
    const i = findInScope(stack, new Set(["td", "th"]), ["tr"]);
    if (i > 0) popTo(stack, i, at);
  } else if (name === "tr") {
    const i = findInScope(stack, new Set(["tr"]), ["thead", "tbody", "tfoot"]);
    if (i > 0) popTo(stack, i, at);
  } else if (name === "thead" || name === "tbody" || name === "tfoot") {
    const i = findInScope(stack, new Set(["thead", "tbody", "tfoot"]));
    if (i > 0) popTo(stack, i, at);
  } else if (name === "option" || name === "optgroup") {
    const i = findInScope(stack, new Set(name === "option" ? ["option"] : ["option", "optgroup"]), ["select"]);
    if (i > 0) popTo(stack, i, at);
  }
  if (P_CLOSERS.has(name)) {
    const i = findInScope(stack, new Set(["p"]), ["button"]);
    if (i > 0) popTo(stack, i, at);
  }
  if (HEADINGS.has(name) && HEADINGS.has(top().name)) popTo(stack, stack.length - 1, at);
}

/**
 * Parse into an element tree. Each element records start/end and innerStart/innerEnd
 * offsets plus closeKind: "explicit", "void", "implicit" (closed by another tag) or "eof".
 * `clean` is true when the element and all descendants were closed explicitly, which is
 * the only case where source ranges are guaranteed to match the browser's DOM.
 */
export function parse(source) {
  const tokens = tokenize(source);
  const root = { name: "#root", attrs: [], children: [], start: 0, end: source.length, innerStart: 0, innerEnd: source.length, closeKind: "explicit", parent: null, foreign: false };
  const stack = [root];
  const elements = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "open") {
      applyImplicitCloses(token.name, stack, token.start);
      const parent = stack[stack.length - 1];
      const foreign = parent.foreign ? parent.name !== "foreignobject" : token.name === "svg" || token.name === "math";
      const element = {
        name: token.name, attrs: token.attrs, open: token, close: null, tokenIndex: index,
        start: token.start, end: token.end, innerStart: token.end, innerEnd: token.end,
        children: [], parent, foreign, closeKind: null
      };
      parent.children.push(element);
      elements.push(element);
      if (VOID_ELEMENTS.has(token.name) || (token.selfClosing && foreign)) element.closeKind = "void";
      else stack.push(element);
    } else if (token.type === "close") {
      let i = stack.length - 1;
      while (i > 0 && stack[i].name !== token.name) i--;
      if (i === 0) { token.stray = true; continue; }
      popTo(stack, i + 1, token.start);
      const element = stack.pop();
      element.close = token;
      element.innerEnd = token.start;
      element.end = token.end;
      element.closeKind = "explicit";
    }
  }
  while (stack.length > 1) {
    const element = stack.pop();
    element.closeKind = "eof";
    element.innerEnd = source.length;
    element.end = source.length;
  }
  const markClean = (element) => {
    let clean = element.closeKind === "explicit" || element.closeKind === "void";
    for (const child of element.children) clean = markClean(child) && clean;
    element.clean = clean;
    return clean;
  };
  for (const child of root.children) markClean(child);
  return { source, tokens, root, elements };
}

export function attr(element, name) {
  const found = element.attrs?.find((a) => a.name === name);
  return found ? found.value : null;
}

export function classes(element) {
  const value = attr(element, "class");
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

export function hasClass(element, name) {
  return classes(element).includes(name);
}

export function ancestors(element) {
  const list = [];
  for (let node = element.parent; node && node.name !== "#root"; node = node.parent) list.push(node);
  return list;
}

/** Tokens fully inside [start, end), using binary search on the ordered token list. */
export function tokensIn(doc, start, end) {
  const { tokens } = doc;
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].start < start) lo = mid + 1;
    else hi = mid;
  }
  const result = [];
  for (let i = lo; i < tokens.length && tokens[i].end <= end; i++) result.push(tokens[i]);
  return result;
}

/** Decoded text content of an element (like DOM textContent, minus comments). */
export function textContent(doc, element) {
  let text = "";
  for (const token of tokensIn(doc, element.innerStart, element.innerEnd)) {
    if (token.type === "text") text += token.raw ? doc.source.slice(token.start, token.end) : decodeEntities(doc.source.slice(token.start, token.end));
  }
  return text;
}

/** Text a reader sees in an element: no scripts, styles, SVG labels, or generated blocks. */
export function visibleTextContent(doc, element) {
  const skipped = doc.elements
    .filter((e) => e !== element && e.start >= element.start && e.end <= element.end && (["script", "style", "template", "svg"].includes(e.name) || attr(e, "data-hr-generated") !== null))
    .map((e) => [e.start, e.end]);
  let text = "";
  for (const token of tokensIn(doc, element.innerStart, element.innerEnd)) {
    if (token.type !== "text" || token.raw) continue;
    if (skipped.some(([start, end]) => token.start >= start && token.end <= end)) continue;
    text += decodeEntities(doc.source.slice(token.start, token.end));
  }
  return text;
}

export function normalizeText(text) {
  return text.replace(/[ \s]+/g, " ").trim();
}

export function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ",
  thinsp: " ", shy: "­", mdash: "—", ndash: "–", hellip: "…", bull: "•",
  middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«",
  raquo: "»", copy: "©", reg: "®", trade: "™", deg: "°", plusmn: "±",
  times: "×", divide: "÷", minus: "−", le: "≤", ge: "≥", ne: "≠",
  asymp: "≈", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
  lArr: "⇐", rArr: "⇒", hArr: "⇔", check: "✓", cross: "✗", star: "☆",
  starf: "★", sect: "§", para: "¶", dagger: "†", euro: "€", pound: "£",
  yen: "¥", cent: "¢", frac12: "½", frac14: "¼", frac34: "¾", hearts: "♥",
  infin: "∞", prime: "′", Prime: "″", zwj: "‍", zwnj: "‌", eacute: "é",
  egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô",
  ucirc: "û", icirc: "î", iuml: "ï", euml: "ë", Eacute: "É", uuml: "ü",
  ouml: "ö", auml: "ä", szlig: "ß", ntilde: "ñ", aacute: "á", oacute: "ó",
  uacute: "ú", iacute: "í", sup2: "²", sup3: "³", micro: "µ"
};

export function decodeEntities(text) {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10ffff) return match;
      return String.fromCodePoint(code === 0 ? 0xfffd : code);
    }
    const value = NAMED[body];
    return value === undefined ? match : value;
  });
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Apply non-overlapping {start, end, text} edits to source. */
export function splice(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  let limit = Infinity;
  for (const edit of sorted) {
    if (edit.end > limit) throw new Error("overlapping edits");
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    limit = edit.start;
  }
  return out;
}
