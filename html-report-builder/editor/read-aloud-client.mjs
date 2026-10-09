// Read aloud in the editor page, loaded by overlay.js. Reads a report section by section (or a
// deck slide by slide, with its speaker notes) through Speechify, highlighting the section and
// the words being spoken like t3code: the CSS Custom Highlight API over the on-screen text,
// aligned to the spoken transcript, so the report's DOM is never changed.
import { ReadAloudSession, alignTranscript, nextRate, wordWindow } from "./read-aloud-core.mjs";

const HIGHLIGHT = "hre-read-aloud";
const UI = "[data-hr-ui], [data-hr-comments]";
const SKIP_WORDS = `pre, button, svg, canvas, video, audio, .device, [aria-hidden='true'], [hidden], script, style, template, noscript, ${UI}`;
const ROW = "tr, .bars > div, .roadmap > div";
const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, td, th, figcaption, blockquote, summary";
const RATE_KEY = "hre-read-aloud-rate";
const CUE_KEY = `hre-read:${location.pathname}`;
const MAX_TEXT = 60_000;
const SILENT_WAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.8v10.4l8.6-5.2z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5h3v11H4zm5 0h3v11H9z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2.5h2v11H3zm10 0v11L5.5 8z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11 2.5h2v11h-2zM3 2.5v11L10.5 8z" fill="currentColor"/></svg>',
  spin: '<span class="ra-spin" aria-hidden="true"></span>'
};
const MEDIA = window.matchMedia("(prefers-reduced-motion: reduce)");

const textOf = (element) => (element ? element.textContent.replace(/\s+/g, " ").trim() : "");
const voiceName = (voice) => (voice ? voice.replace(/_\d+$/, "").replace(/(^|_)(\w)/g, (m, s, c) => `${s ? " " : ""}${c.toUpperCase()}`) : "");

// ----- sections -----

/** Units in reading order: a deck's slides (with their notes), or a report's title block and sections. */
function discoverUnits() {
  return findUnits().map((unit) => ({ ...unit, text: () => unitText(unit) }));
}

function findUnits() {
  const main = document.querySelector("main");
  const children = main ? [...main.children] : [];
  const slides = children.filter((element) => element.classList.contains("slide"));
  if (slides.length) {
    return slides.map((slide, index) => {
      const notes = slide.nextElementSibling && slide.nextElementSibling.matches("aside.notes") ? slide.nextElementSibling : null;
      return { key: slide.id || `slide-${index + 1}`, kind: "slide", label: slide.dataset.toc || textOf(slide.querySelector("h2, h1")) || `Slide ${index + 1}`, elements: notes ? [slide, notes] : [slide], anchor: slide };
    });
  }
  const units = [];
  const hero = document.querySelector("header.hero");
  if (hero && !(main && main.contains(hero))) units.push({ key: "hero", kind: "hero", label: "Title", elements: [hero], anchor: hero.querySelector("h1") || hero });
  const visit = (element) => {
    for (const child of element.children) {
      if (child.matches(UI)) continue;
      const heading = child.tagName === "SECTION" && child.id ? [...child.children].find((c) => c.tagName === "H2") : null;
      if (heading) units.push({ key: child.id, kind: "section", label: child.dataset.toc || textOf(heading), elements: [child], anchor: heading });
      else if (child.tagName !== "SECTION") visit(child);
    }
  };
  if (main) visit(main);
  if (units.length <= (hero ? 1 : 0) && main) units.push({ key: "main", kind: "section", label: "Report", elements: [main], anchor: main });
  return units;
}

// ----- the text the script writer sees -----

/** A markdown-like rendering of a unit, making visible labels (often CSS ::before) explicit. */
function unitText(unit) {
  const out = [];
  let line = "";
  const flush = () => {
    const text = line.replace(/\s+/g, " ").trim();
    if (text) out.push(text);
    line = "";
  };
  const inline = (element) => {
    const saved = line;
    line = "";
    walkChildren(element);
    const text = line.replace(/\s+/g, " ").trim();
    line = saved;
    return text;
  };
  const caption = (element) => textOf(element.closest("figure")?.querySelector(":scope > figcaption")) || element.getAttribute("aria-label") || textOf(element.querySelector("title")) || "";
  const numberOf = (element, selector) => [...document.querySelectorAll(selector)].indexOf(element) + 1;
  const walkChildren = (element) => { for (const child of element.childNodes) walk(child); };
  const walk = (node) => {
    if (node.nodeType === 3) { line += node.data; return; }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = el.tagName;
    if (tag === "svg" || tag === "CANVAS") { flush(); out.push(`[Chart: ${caption(el) || "a chart"}]`); return; }
    if (tag === "IMG") { if (el.alt) { flush(); out.push(`[Image: ${el.alt}]`); } return; }
    if (el.matches(".device")) { flush(); out.push(`[Mockup: ${caption(el) || "a product screen"}]`); return; }
    if (el.matches(`${UI}, button, script, style, template, noscript, [hidden], [aria-hidden='true']`)) return;
    if (tag === "DETAILS" && !el.open) { const summary = el.querySelector(":scope > summary"); if (summary) { flush(); out.push(`${inline(summary)} (collapsed)`); } return; }
    if (tag === "PRE") { flush(); out.push(`\`\`\`\n${el.textContent.trim().slice(0, 1500)}\n\`\`\``); return; }
    if (tag === "BR") { line += " "; return; }
    if (/^H[1-6]$/.test(tag)) {
      flush();
      const label = el.parentElement?.matches(".question") ? `(Question ${numberOf(el.parentElement, ".question")}) ` : el.parentElement?.matches(".finding") ? `(Finding ${numberOf(el.parentElement, ".finding")}) ` : "";
      out.push(`${"#".repeat(Number(tag[1]))} ${label}${inline(el)}`);
      return;
    }
    if (tag === "TR") {
      flush();
      const cells = [...el.children].map((cell) => inline(cell));
      out.push([...el.children].every((cell) => cell.tagName === "TH") ? `Columns: ${cells.join(" | ")}` : `| ${cells.join(" | ")} |`);
      return;
    }
    if (el.matches(".bars > div, .roadmap > div")) {
      flush();
      if (el.matches(".scale")) out.push(`Scale: ${[...el.querySelectorAll("small > span")].map(textOf).join(" | ")}`);
      else out.push(`${textOf(el.querySelector(":scope > span"))}: ${textOf(el.querySelector(":scope > b"))}`);
      return;
    }
    if (el.matches(".tile")) { flush(); const small = textOf(el.querySelector(":scope > small")); out.push(`${textOf(el.querySelector(":scope > span"))}: ${textOf(el.querySelector(":scope > b"))}${small ? ` (${small})` : ""}`); return; }
    if (el.matches(".pill")) { line += ` [${textOf(el)}] `; return; }
    if (el.matches(".answer")) { flush(); const text = inline(el); out.push(`(Answer) ${text || "not answered yet"}`); return; }
    if (tag === "LI") {
      flush();
      const list = el.parentElement;
      const mark = list?.matches(".checklist") ? (el.classList.contains("done") ? "(Done) " : "(To do) ") : list?.matches(".pros") ? "(Pro) " : list?.matches(".cons") ? "(Con) " : "";
      out.push(`- ${mark}${inline(el)}`);
      return;
    }
    if (el.matches("aside.notes")) { flush(); out.push("Speaker notes:"); walkChildren(el); flush(); return; }
    const block = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|FIGCAPTION|BLOCKQUOTE|DL|DT|DD|TABLE|THEAD|TBODY|UL|OL|DETAILS|SUMMARY|ASIDE|MAIN|NAV)$/.test(tag);
    if (block) flush();
    if (el.matches(".rec")) line += "(Recommendation) ";
    else if (el.matches(".owner")) line += "(Owner) ";
    else if (el.matches(".links")) line += "(Details) ";
    else if (el.matches(".internal")) line += "(Internal note) ";
    else if (el.matches(".compare > .before") && !el.querySelector(":scope > :is(h3, h4):first-child")) line += "(Before) ";
    else if (el.matches(".compare > .after") && !el.querySelector(":scope > :is(h3, h4):first-child")) line += "(After) ";
    else if (el.matches(".option.recommended")) line += "(Recommended) ";
    walkChildren(el);
    if (block) flush();
  };
  for (const element of unit.elements) { walk(element); flush(); }
  return out.join("\n").slice(0, MAX_TEXT);
}

// ----- words on screen (port of t3code readAloudHighlight.ts) -----

function collectWords(unit) {
  const words = [];
  for (const element of unit.elements) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP_WORDS)) return NodeFilter.FILTER_REJECT;
        const details = parent.closest("details:not([open])");
        if (details && !parent.closest("summary")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const row = node.parentElement.closest(ROW);
      for (const match of node.data.matchAll(/\S+/g)) words.push({ node, start: match.index, end: match.index + match[0].length, row: row && element.contains(row) ? row : null });
    }
  }
  return words;
}

// ----- audio (port of t3code readAloudPlayback.ts) -----

let silentUrl = null;
function createAudioPlayer({ onEnded, onError }) {
  let audio = null;
  let active = null;
  const element = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", () => { if (active) onEnded(); });
    audio.addEventListener("error", () => { if (active) onError(audio.error || new Error("The audio could not be played.")); });
    return audio;
  };
  const playing = (url) => (error) => { if (error?.name !== "AbortError" && active === url) onError(error); };
  return {
    play(url, rate, startAt) {
      const a = element();
      active = url;
      a.src = url;
      // A new source resets playbackRate to the default, so set both.
      a.defaultPlaybackRate = rate;
      a.playbackRate = rate;
      if (startAt > 0) a.addEventListener("loadedmetadata", () => { if (active === url) a.currentTime = startAt; }, { once: true });
      a.play().catch(playing(url));
    },
    pause() { audio?.pause(); },
    resume() { if (audio && active) audio.play().catch(playing(active)); },
    stop() {
      active = null;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
    setRate(rate) { if (audio) { audio.defaultPlaybackRate = rate; audio.playbackRate = rate; } },
    currentTime() { return audio && active ? audio.currentTime : 0; },
    duration() { return audio && active && Number.isFinite(audio.duration) ? audio.duration : null; },
    /** Play silence inside the click so Safari allows play() once the script is ready seconds later. */
    unlock() {
      const a = element();
      if (active) return;
      silentUrl ??= URL.createObjectURL(new Blob([Uint8Array.from(atob(SILENT_WAV), (c) => c.charCodeAt(0))], { type: "audio/wav" }));
      a.src = silentUrl;
      a.play().catch(() => {});
    }
  };
}

// ----- mount -----

export function mountReadAloud({ root, host, toast, request }) {
  const $ = (id) => root.getElementById(id);
  const hasHighlights = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
  let status = null;
  let statusCheck = null;
  let message = null; // {text, action: "check" | "retry", key}
  let units = [];
  let markedUnit = null;
  let markedRow = null;
  let markedBlock = null;
  let words = null; // {key, transcript, list, alignment, dirty}
  let lastWindow = null;
  let follow = true;
  let lastUserScroll = 0;
  let lastAutoScroll = 0;
  let hoveredKey = null;
  let frame = 0;
  let preparingTimer = 0;
  let lastBar = 0;
  let lastKey = null;

  const observer = new MutationObserver(() => { if (words) words.dirty = true; });
  const refreshUnits = () => { units = discoverUnits(); return units; };
  refreshUnits();

  const makePlayer = window.__hreReadAloudPlayer || createAudioPlayer;
  const player = makePlayer({ onEnded: () => session.handleEnded(), onError: (error) => session.handleError(error) });

  const session = new ReadAloudSession({
    player,
    units: () => refreshUnits(),
    prepare: (unit, { text, synthesize, signal }) => {
      const list = units;
      return request("/api/read-aloud/prepare", { key: unit.key, kind: unit.kind, label: unit.label, index: list.findIndex((u) => u.key === unit.key) + 1, total: list.length, text, synthesize }, { signal });
    },
    loadTimings: async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.detail || data?.error || `Timings failed (${response.status})`);
        error.status = response.status;
        error.data = data || {};
        throw error;
      }
      return data;
    },
    onChange: render,
    onNotice: (text) => toast(text),
    onError: (error, unit) => {
      const data = error?.data || {};
      if (data.state && data.state !== "ready" && (error.status === 503 || data.reason === "speech-failed")) {
        status = { state: data.state, detail: data.detail || error.message };
        message = { text: statusText(status), action: "check" };
      } else {
        message = { text: error?.message || "Read aloud stopped.", action: "retry", key: unit?.key };
      }
      render(session.snapshot());
    }
  });
  const saved = Number(localStorage.getItem(RATE_KEY));
  if ([1, 1.1, 1.2, 1.5].includes(saved)) session.rate = saved;

  // ----- UI: the reader strip (toolbar shadow root) and section buttons (own shadow host) -----
  const strip = document.createElement("section");
  strip.className = "reader";
  strip.id = "reader";
  strip.hidden = true;
  strip.setAttribute("aria-label", "Read aloud");
  strip.innerHTML = `<div class="ra-row">
      <button id="ra-prev" title="Previous section ([)" aria-label="Previous section">${ICONS.prev}</button>
      <button id="ra-play" class="ra-play" title="Play or pause (R)" aria-label="Play">${ICONS.play}</button>
      <button id="ra-next" title="Next section (])" aria-label="Next section">${ICONS.next}</button>
      <button id="ra-rate" title="Speed">1×</button>
      <span class="ra-label" id="ra-label"></span>
      <span class="ra-status" id="ra-status" role="status"></span>
      <button id="ra-follow" hidden title="Scroll back to the words being read">Follow</button>
      <button id="ra-action" hidden></button>
      <button id="ra-stop" title="Stop reading" aria-label="Stop reading">×</button>
    </div>
    <div class="ra-progress"><i id="ra-bar"></i></div>`;
  root.append(strip);

  const readHost = document.createElement("div");
  readHost.id = "hre-read";
  readHost.setAttribute("data-hr-ui", "");
  readHost.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147481000";
  document.body.append(readHost);
  const readRoot = readHost.attachShadow({ mode: "open" });
  readRoot.innerHTML = '<link rel="stylesheet" href="/__hre/toolbar.css"><div id="buttons"></div>';

  // ----- status -----
  /** Our explanation first, then Speechify's own detail (such as when a spend cap resets). */
  function statusText(value) {
    if (!value) return "";
    const lead = (text) => {
      const detail = (value.detail || "").trim().replace(/\.$/, "");
      return detail && !text.toLowerCase().startsWith(detail.toLowerCase()) && !detail.toLowerCase().startsWith(text.toLowerCase()) ? `${text} (${detail}).` : `${text}.`;
    };
    if (value.state === "missing-key") return value.detail || "No Speechify API key. Set SPEECHIFY_API_KEY, then press Check again.";
    if (value.state === "invalid-key") return lead("Speechify rejected the API key");
    if (value.state === "insufficient-credits") return lead("Speechify has no credits left for this key");
    if (value.state === "unavailable") return "Speechify is unreachable right now.";
    return value.detail || "";
  }
  function checkStatus(refresh = false) {
    statusCheck ??= request("/api/read-aloud/status", { refresh }).then((value) => {
      status = value;
      if (value.state === "ready") { if (message?.action === "check") message = null; }
      else message = { text: statusText(value), action: "check" };
      return value;
    }, (error) => {
      message = { text: error.message, action: "check" };
      return null;
    }).finally(() => { statusCheck = null; render(session.snapshot()); });
    return statusCheck;
  }

  // ----- painting -----
  const currentUnit = () => units.find((unit) => unit.key === session.key) || null;
  function markUnit(unit) {
    if (markedUnit === unit?.key) return;
    for (const element of document.querySelectorAll(".hre-reading")) element.classList.remove("hre-reading");
    markedUnit = unit?.key || null;
    if (unit) for (const element of unit.elements) element.classList.add("hre-reading");
    observer.disconnect();
    if (unit) for (const element of unit.elements) observer.observe(element, { subtree: true, childList: true, characterData: true });
    words = null;
  }
  function markRow(row) {
    if (row === markedRow) return;
    markedRow?.removeAttribute("data-hre-reading-row");
    row?.setAttribute("data-hre-reading-row", "");
    markedRow = row;
  }
  function markBlock(block) {
    if (block === markedBlock) return;
    markedBlock?.classList.remove("hre-reading-block");
    block?.classList.add("hre-reading-block");
    markedBlock = block;
  }
  function clearWords() {
    if (hasHighlights) CSS.highlights.delete(HIGHLIGHT);
    markRow(null);
    markBlock(null);
    lastWindow = null;
  }
  function wordsFor(unit, transcript) {
    const stale = !words || words.key !== unit.key || words.transcript !== transcript || words.dirty
      || (words.list.length && !(words.list[0].node.isConnected && words.list.at(-1).node.isConnected));
    if (stale) {
      const list = collectWords(unit);
      words = { key: unit.key, transcript, list, dirty: false, alignment: transcript ? alignTranscript(list.map((w) => w.node.data.slice(w.start, w.end)), transcript) : null };
      lastWindow = null;
    }
    return words;
  }
  /** Highlights the words at the voice's position; returns their box for follow-scrolling. */
  function paint() {
    const unit = currentUnit();
    const fraction = session.readAlongFraction();
    if (!unit || fraction === null) { clearWords(); return null; }
    const { list, alignment } = wordsFor(unit, session.transcript());
    const range = wordWindow(list.length, fraction, alignment, (i) => list[i].row);
    if (!range) { clearWords(); return null; }
    const ranges = list.slice(range.start, range.end).map((word) => {
      const r = new Range();
      r.setStart(word.node, word.start);
      r.setEnd(word.node, word.end);
      return r;
    });
    if (!lastWindow || lastWindow.start !== range.start || lastWindow.end !== range.end) {
      lastWindow = range;
      markRow(list[range.start].row);
      if (hasHighlights) CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
      else markBlock(list[range.start].row ? null : list[range.start].node.parentElement.closest(BLOCK));
    }
    return ranges[0].getBoundingClientRect();
  }

  // ----- following -----
  const reduced = () => MEDIA.matches;
  const bottomLimit = () => window.innerHeight - 150;
  function scrollToUnit(unit) {
    const first = unit?.elements[0];
    if (!first) return;
    const rect = first.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.5) return;
    lastAutoScroll = Date.now();
    first.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  }
  function followWord(rect) {
    if (!rect || (!rect.width && !rect.height)) return;
    const visible = rect.top >= 16 && rect.bottom <= bottomLimit();
    if (!follow && visible && Date.now() - lastUserScroll > 2000) { follow = true; renderFollow(); }
    if (!follow || visible || Date.now() - lastAutoScroll < 700) return;
    lastAutoScroll = Date.now();
    window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight * 0.3, behavior: reduced() ? "auto" : "smooth" });
  }
  const userScrolled = () => {
    if (!session.isActive()) return;
    lastUserScroll = Date.now();
    if (follow) { follow = false; renderFollow(); }
  };
  window.addEventListener("wheel", userScrolled, { passive: true });
  window.addEventListener("touchmove", userScrolled, { passive: true });
  document.addEventListener("keydown", (event) => {
    const target = event.composedPath()[0];
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "].includes(event.key)) userScrolled();
  }, true);
  function renderFollow() { $("ra-follow").hidden = follow || !session.isActive(); }

  // ----- loop -----
  function loop() {
    frame = 0;
    if (session.phase !== "playing") return;
    session.reportProgress(player.currentTime(), player.duration());
    followWord(paint());
    const now = Date.now();
    if (now - lastBar > 250) {
      lastBar = now;
      const { position, duration } = session.progress;
      const total = duration || session.prepared?.estimatedSeconds || 0;
      $("ra-bar").style.width = `${total ? Math.min(100, (position / total) * 100) : 0}%`;
    }
    frame = requestAnimationFrame(loop);
  }

  // ----- section buttons -----
  function layoutButtons() {
    const layer = readRoot.getElementById("buttons");
    const snapshot = session.snapshot();
    const existing = new Map([...layer.children].map((button) => [button.dataset.key, button]));
    for (const unit of units) {
      let button = existing.get(unit.key);
      existing.delete(unit.key);
      if (!button) {
        button = document.createElement("button");
        button.className = "ra-sec";
        button.dataset.key = unit.key;
        button.addEventListener("click", () => sectionClick(button.dataset.key));
        layer.append(button);
      }
      const current = unit.key === snapshot.key && session.isActive();
      const icon = current && snapshot.phase === "preparing" ? "spin" : current && snapshot.phase === "playing" ? "pause" : "play";
      if (button.dataset.icon !== icon) { button.innerHTML = ICONS[icon]; button.dataset.icon = icon; }
      button.title = current && snapshot.phase === "playing" ? `Pause reading "${unit.label}"` : `Read aloud from "${unit.label}" (R)`;
      button.setAttribute("aria-label", button.title);
      button.classList.toggle("current", current);
      button.classList.toggle("show", unit.key === hoveredKey);
      const anchor = unit.anchor.getBoundingClientRect();
      const box = unit.kind === "slide" ? unit.elements[0].getBoundingClientRect() : anchor;
      if (!box.width && !box.height) { button.hidden = true; continue; }
      button.hidden = false;
      const gutter = box.left >= 44;
      const left = gutter ? box.left - 36 : box.right - 34;
      const top = unit.kind === "slide" ? box.top + (gutter ? 6 : 8) : anchor.top + Math.min(anchor.height, 44) / 2 - 14;
      button.style.left = `${Math.round(left + window.scrollX)}px`;
      button.style.top = `${Math.round(top + window.scrollY)}px`;
    }
    for (const stale of existing.values()) stale.remove();
  }
  let layoutFrame = 0;
  const scheduleLayout = () => { cancelAnimationFrame(layoutFrame); layoutFrame = requestAnimationFrame(() => { refreshUnits(); layoutButtons(); }); };
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("load", scheduleLayout);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleLayout).observe(document.body);
  document.addEventListener("mouseover", (event) => {
    const target = event.target;
    const unit = target === readHost ? units.find((u) => u.key === hoveredKey) : units.find((u) => u.elements.some((element) => element.contains(target)));
    const key = unit ? unit.key : null;
    if (key === hoveredKey) return;
    hoveredKey = key;
    layoutButtons();
  });
  new MutationObserver(() => {
    if (document.documentElement.classList.contains("hr-presenting")) session.pause("presenting");
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // ----- render -----
  function render(snapshot) {
    const active = snapshot.phase !== "idle";
    strip.hidden = !active && !message;
    host.classList.toggle("reading", !strip.hidden);
    $("listen")?.classList.toggle("active", active);
    if ($("listen")) {
      $("listen").classList.toggle("warn", Boolean(status && status.state !== "ready"));
      $("listen").title = status && status.state !== "ready" ? statusText(status) : "Read aloud from the section in view (R)";
    }
    const unit = currentUnit();
    if (snapshot.key !== lastKey) {
      lastKey = snapshot.key;
      clearWords();
      if (unit && active && snapshot.phase !== "cued") { follow = true; scrollToUnit(unit); }
    }
    markUnit(active ? unit : null);
    $("ra-label").textContent = active && unit ? `${unit.label} · ${snapshot.index + 1} / ${snapshot.total}` : "";
    $("ra-play").innerHTML = snapshot.phase === "playing" ? ICONS.pause : snapshot.phase === "preparing" ? ICONS.spin : ICONS.play;
    $("ra-play").setAttribute("aria-label", snapshot.phase === "playing" ? "Pause" : "Play");
    $("ra-rate").textContent = `${snapshot.rate}×`;
    $("ra-prev").disabled = !active || snapshot.index <= 0;
    $("ra-next").disabled = !active || snapshot.index >= snapshot.total - 1;
    const statusLine = $("ra-status");
    statusLine.classList.toggle("error", Boolean(message));
    clearInterval(preparingTimer);
    if (message) statusLine.textContent = message.text;
    else if (snapshot.phase === "preparing") {
      const tick = () => { statusLine.textContent = `Writing the spoken script… ${Math.round((Date.now() - snapshot.preparingSince) / 1000)} s`; };
      tick();
      preparingTimer = setInterval(tick, 500);
    } else if (snapshot.phase === "playing") {
      const script = snapshot.script;
      statusLine.textContent = [`Speechify · ${voiceName(snapshot.voice)}`, script ? `script by ${script.model}${script.fallback ? ` (OpenRouter: ${script.fallback})` : ""}` : ""].filter(Boolean).join(" · ");
    } else if (snapshot.phase === "paused") {
      statusLine.textContent = { editing: "Paused while you edit", ai: "Paused while the AI panel is open", presenting: "Paused while presenting" }[snapshot.pauseReason] || "Paused";
    } else if (snapshot.phase === "cued") statusLine.textContent = `Paused at ${unit?.label || "this section"} · press play to continue`;
    else statusLine.textContent = "";
    $("ra-action").hidden = !message;
    if (message) $("ra-action").textContent = message.action === "check" ? "Check again" : "Retry";
    renderFollow();
    if (!active) { $("ra-bar").style.width = "0%"; clearWords(); }
    else if (snapshot.phase === "playing") { if (!frame) frame = requestAnimationFrame(loop); }
    else followWord(paint());
    layoutButtons();
  }

  // ----- actions -----
  function visibleUnitKey() {
    let best = units[0]?.key || null;
    for (const unit of units) if (unit.elements[0].getBoundingClientRect().top < window.innerHeight * 0.4) best = unit.key;
    return best;
  }
  function begin(key) {
    player.unlock?.();
    message = null;
    follow = true;
    if (!status || status.state !== "ready") {
      checkStatus(status && status.state !== "ready").then((value) => { if (value?.state === "ready") session.start(key); });
      render(session.snapshot());
      return;
    }
    session.start(key);
  }
  function toggle() {
    refreshUnits();
    if (session.phase === "idle") begin(visibleUnitKey());
    else {
      if (session.phase === "paused" || session.phase === "cued") player.unlock?.();
      session.toggle();
    }
  }
  function sectionClick(key) {
    if (session.key === key && session.isActive()) toggle();
    else begin(key);
  }
  $("ra-play").addEventListener("click", toggle);
  $("ra-prev").addEventListener("click", () => { follow = true; session.previous(); });
  $("ra-next").addEventListener("click", () => { follow = true; session.next(); });
  $("ra-stop").addEventListener("click", () => { message = null; session.stop(); });
  $("ra-rate").addEventListener("click", () => {
    const rate = nextRate(session.rate);
    localStorage.setItem(RATE_KEY, String(rate));
    session.setRate(rate);
  });
  $("ra-follow").addEventListener("click", () => {
    follow = true;
    lastAutoScroll = 0;
    renderFollow();
    followWord(paint());
  });
  $("ra-action").addEventListener("click", () => {
    const retry = message;
    message = null;
    if (retry?.action === "retry" && retry.key) begin(retry.key);
    else checkStatus(true).then((value) => { if (value?.state === "ready") toast("Speechify is ready. Press play to listen."); });
    render(session.snapshot());
  });
  $("listen")?.addEventListener("click", toggle);

  const cued = sessionStorage.getItem(CUE_KEY);
  if (cued) {
    sessionStorage.removeItem(CUE_KEY);
    session.cue(cued);
  }
  render(session.snapshot());

  return {
    toggle,
    step: (delta) => { if (session.isActive()) { follow = true; session.step(delta); } },
    pause: (reason) => session.pause(reason),
    isActive: () => session.isActive(),
    persist: () => { if (session.isActive() && session.key) sessionStorage.setItem(CUE_KEY, session.key); },
    session
  };
}
