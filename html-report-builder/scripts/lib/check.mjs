import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ancestors, attr, classes, normalizeText, parse, textContent, visibleTextContent } from "./scan.mjs";
import { RUNTIME_VERSION, TEMPLATES, loadRuntime } from "./runtime.mjs";
import { isLocalReference } from "./build.mjs";
import { readComments } from "./comments.mjs";
import { createHash } from "node:crypto";
import { chartsIn } from "./charts.mjs";
import { diagramsIn } from "./diagrams.mjs";
import { LIBRARIES } from "./vendor.mjs";

const IMAGE_WARN_BYTES = 300 * 1024;
const IMAGES_TOTAL_WARN_BYTES = 2 * 1024 * 1024;
const EVIDENCE = ["observed", "executed", "inferred", "unknown"];
const INTERNAL_NAMES = /\b(?:Codex|Claude|Opus|Sonnet|CodeRabbit|ChatGPT)\b/g;
const NETWORK_JS = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bEventSource\s*\(|\bsendBeacon\s*\(|\bimport\s*\(/;

function summarize(list, limit = 8) {
  const unique = [...new Set(list)];
  return unique.slice(0, limit).join(", ") + (unique.length > limit ? `, +${unique.length - limit} more` : "");
}

/**
 * Validate a report. mode "local" requires every asset inlined; mode "export" allows
 * relative image files that exist next to the report (publish copies).
 */
export function checkSource(source, { file, mode = "local" } = {}) {
  const errors = [];
  const warnings = [];
  const doc = parse(source);
  const { elements } = doc;
  const named = (name) => elements.filter((e) => e.name === name);
  const html = named("html")[0];
  const template = html ? attr(html, "data-template") : null;
  const runtime = loadRuntime(template);
  const audience = (html && attr(html, "data-audience")) || "internal";
  const baseDir = file ? path.dirname(path.resolve(file)) : null;

  if (!doc.tokens.some((t) => t.type === "doctype" && /^<!doctype\s+html/i.test(source.slice(t.start, t.end)))) errors.push("missing <!doctype html>");
  if (!html || !attr(html, "lang")) errors.push("<html> must declare a lang attribute");
  const metas = named("meta");
  if (!metas.some((m) => attr(m, "charset"))) errors.push('missing <meta charset="utf-8">');
  if (!metas.some((m) => (attr(m, "name") || "").toLowerCase() === "viewport")) errors.push("missing a viewport meta tag");
  const title = named("title")[0];
  if (!title || !normalizeText(textContent(doc, title))) errors.push("missing a non-empty <title>");
  for (const required of ["main", "h1"]) if (!named(required).length) errors.push(`missing required <${required}> element`);

  const runtimeStyle = named("style").find((e) => attr(e, "data-hr-runtime") !== null);
  if (!runtimeStyle) errors.push("runtime CSS missing: run `report.mjs build <file>`");
  else if (attr(runtimeStyle, "data-hr-runtime") !== RUNTIME_VERSION) warnings.push(`runtime ${attr(runtimeStyle, "data-hr-runtime")} is older than ${RUNTIME_VERSION}: run \`report.mjs build\` to upgrade`);

  const external = [];
  let imageBytes = 0;
  for (const element of elements) {
    const name = element.name;
    if (name === "script" && attr(element, "src")) external.push(`script src=${attr(element, "src")}`);
    if (name === "link") {
      const rel = (attr(element, "rel") || "").toLowerCase();
      const href = attr(element, "href") || "";
      if (/stylesheet|preload|modulepreload|prefetch|import|icon|manifest/.test(rel) && !href.startsWith("data:")) external.push(`link rel=${rel} href=${href}`);
    }
    if (["img", "audio", "video", "source", "input"].includes(name)) {
      for (const attribute of ["src", "srcset", "poster"]) {
        const value = (attr(element, attribute) || "").trim();
        if (!value) continue;
        if (value.startsWith("data:")) {
          const bytes = Math.round((value.length - value.indexOf(",") - 1) * 0.75);
          imageBytes += bytes;
          if (bytes > IMAGE_WARN_BYTES) warnings.push(`inlined ${name} is ${Math.round(bytes / 1024)} KB (over 300 KB): compress or resize it`);
          continue;
        }
        if (mode === "export" && attribute === "src" && isLocalReference(value) && baseDir) {
          if (!existsSync(path.resolve(baseDir, decodeURI(value.split(/[?#]/)[0])))) errors.push(`${name} file not found next to the export: ${value}`);
          continue;
        }
        external.push(`${name} ${attribute}=${value.length > 80 ? value.slice(0, 77) + "..." : value}`);
      }
    }
    if (name === "image" || name === "use") {
      const href = attr(element, "href") || attr(element, "xlink:href") || "";
      if (href && !href.startsWith("#") && !href.startsWith("data:")) external.push(`${name} href=${href}`);
    }
    if (name === "form" && attr(element, "action")) external.push(`form action=${attr(element, "action")}`);
    if (name === "a" && attr(element, "ping")) external.push(`a ping=${attr(element, "ping")}`);
    if (name === "meta" && (attr(element, "http-equiv") || "").toLowerCase() === "refresh") external.push("meta refresh");
    if (["iframe", "object", "embed"].includes(name)) errors.push(`<${name}> is not allowed; inline the content instead`);
    const inlineStyle = attr(element, "style");
    if (inlineStyle && /url\s*\(\s*(?!["']?(?:data:|#))/i.test(inlineStyle)) external.push(`style url() on <${name}>`);
  }
  if (external.length) errors.push(`external or non-embedded assets: ${summarize(external, 6)}${mode === "local" ? " (local images are inlined by `report.mjs build`)" : ""}`);
  if (imageBytes > IMAGES_TOTAL_WARN_BYTES) warnings.push(`inlined media totals ${(imageBytes / 1048576).toFixed(1)} MB (over 2 MB)`);

  const generated = (element) => ancestors(element).some((a) => attr(a, "data-hr-generated") !== null);
  for (const style of named("style")) {
    if (generated(style)) continue;
    const css = source.slice(style.innerStart, style.innerEnd);
    if (/@import/i.test(css)) errors.push("CSS contains @import");
    const urls = [...css.matchAll(/url\s*\(\s*([^)]+?)\s*\)/gi)].map((m) => m[1].replace(/^["']|["']$/g, "")).filter((u) => !u.startsWith("data:") && !u.startsWith("#"));
    if (urls.length) errors.push(`CSS references external URLs: ${summarize(urls, 4)}`);
    if (attr(style, "data-hr-runtime") !== null) continue;
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").match(/[^{}]+(?=\{)/g) || [];
    const unscoped = selectors.flatMap((s) => s.split(",")).map((s) => s.trim()).filter((s) => s && !s.startsWith("@") && !/\.mock-/.test(s) && !/^(from|to|\d+%)$/.test(s));
    if (unscoped.length) warnings.push(`authored <style> should only target .mock-* classes; unscoped selectors: ${summarize(unscoped, 4)}`);
  }
  for (const script of named("script")) {
    const js = source.slice(script.innerStart, script.innerEnd);
    // The inlined Plotly is trusted only when it is byte-for-byte the pinned release.
    if (attr(script, "data-hr-runtime") === "plotly") {
      const digest = createHash("sha256").update(js.replace(/<\\\/script/gi, "</script")).digest("hex");
      if (digest !== LIBRARIES.plotly.sha256) errors.push("the inlined Plotly is not the pinned release: run `report.mjs build`");
      continue;
    }
    if (attr(script, "data-hr-diagram") !== null && (attr(script, "type") || "").toLowerCase() === "text/x-mermaid") continue;
    if (NETWORK_JS.test(js)) errors.push("JavaScript contains a network-capable API");
    if (attr(script, "data-hr-runtime") === null && js.trim() && (attr(script, "type") || "").toLowerCase() !== "application/json") warnings.push("authored <script> found; reports should rely on the runtime script");
  }

  const ids = new Map();
  for (const element of elements) {
    const id = attr(element, "id");
    if (id) ids.set(id, (ids.get(id) || 0) + 1);
  }
  const duplicates = [...ids].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length) errors.push(`duplicate ids: ${summarize(duplicates)}`);
  const missingAnchors = [];
  for (const anchor of named("a")) {
    const href = attr(anchor, "href") || "";
    if (href.startsWith("#") && href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) missingAnchors.push(href);
  }
  if (missingAnchors.length) errors.push(`links to missing ids: ${summarize(missingAnchors)}`);
  if (baseDir) {
    const brokenFiles = named("a").map((a) => attr(a, "href") || "").filter((href) => isLocalReference(href) && !href.startsWith("?"))
      .filter((href) => !existsSync(path.resolve(baseDir, decodeURI(href.split(/[?#]/)[0]))));
    if (brokenFiles.length) warnings.push(`relative links to files that do not exist next to the report: ${summarize(brokenFiles, 4)}`);
  }

  const vocabulary = runtime.classes;
  const unknown = [];
  for (const element of elements) {
    const list = classes(element);
    if (!list.length) continue;
    if (element.foreign || ancestors(element).some((a) => a.name === "svg" || classes(a).includes("device"))) continue;
    for (const name of list) if (!vocabulary.has(name) && !name.startsWith("mock-")) unknown.push(name);
  }
  if (unknown.length) warnings.push(`classes outside the component vocabulary (no styling): ${summarize(unknown)}`);

  if (template) {
    const spec = TEMPLATES[template];
    if (!spec) warnings.push(`unknown data-template "${template}" (expected ${Object.keys(TEMPLATES).join(", ")})`);
    else {
      const missing = spec.required.filter((id) => !ids.has(id));
      if (missing.length) warnings.push(`${template} template sections missing: ${missing.map((id) => `#${id}`).join(", ")}`);
    }
  }
  const main = named("main")[0];
  if (main) {
    const loose = main.children.filter((c) => c.name === "section" && !attr(c, "id"));
    if (loose.length) warnings.push(`${loose.length} <main> section(s) without an id (no anchor or TOC entry)`);
  }
  if (TEMPLATES[template]?.deck && main) checkDeck(doc, main, warnings);

  const questions = elements.filter((e) => classes(e).includes("question"));
  questions.forEach((question, index) => {
    const id = attr(question, "id");
    const heading = question.children.find((c) => /^h[2-4]$/.test(c.name));
    const label = heading ? normalizeText(textContent(doc, heading)).slice(0, 60) : `question ${index + 1}`;
    if (!id) errors.push(`question card without an id: "${label}"`);
    else if (id !== `q${index + 1}`) warnings.push(`question ids should run q1, q2, ... in order (found #${id} at position ${index + 1}) so "Q${index + 1}" matches its anchor`);
    if (!heading) errors.push(`question card #${id || index + 1} needs an <h3> with the full question`);
    else if (!/\?\s*$/.test(normalizeText(textContent(doc, heading)))) warnings.push(`question #${id || index + 1} title is not a full question: "${label}"`);
    if (!elements.some((e) => classes(e).includes("rec") && ancestors(e).includes(question))) warnings.push(`question #${id || index + 1} has no .rec: add a recommended default, or accept this warning when no recommendation is possible`);
  });

  for (const token of doc.tokens) {
    if (token.type === "comment" && /^<!--\s*guide:/i.test(source.slice(token.start, token.end))) {
      errors.push("template <!-- guide: --> comments remain: replace them with content");
      break;
    }
  }
  // Review comments are hidden from readers, so their text is not report text.
  const comments = readComments(source, doc);
  const inComments = (token) => comments.store && token.start >= comments.store.start && token.end <= comments.store.end;
  const visibleText = [];
  const codeRanges = elements.filter((e) => e.name === "pre" || e.name === "code").map((e) => [e.innerStart, e.innerEnd]);
  for (const token of doc.tokens) {
    if (token.type !== "text" || token.raw || inComments(token)) continue;
    const text = source.slice(token.start, token.end);
    if (/\{\{[^}]+\}\}|\[PLACEHOLDER\]/.test(text)) errors.push(`unfinished placeholder: ${text.trim().slice(0, 60)}`);
    if (/\bTODO\b/.test(text) && !codeRanges.some(([s, e]) => token.start >= s && token.end <= e)) visibleText.push(text.trim().slice(0, 50));
  }
  if (visibleText.length) warnings.push(`"TODO" appears in visible text: ${summarize(visibleText, 3)}`);

  const optionGroups = elements.filter((e) => classes(e).includes("options"));
  const unranked = optionGroups.filter((group) => !elements.some((e) => classes(e).includes("recommended") && ancestors(e).includes(group)));
  if (unranked.length) warnings.push(`${unranked.length} .options block(s) without a .recommended option`);

  const tables = named("table").filter((t) => !ancestors(t).some((a) => classes(a).includes("table-wrap") || classes(a).includes("device")));
  if (tables.length) warnings.push(`${tables.length} table(s) not wrapped in <div class="table-wrap"> (may overflow on mobile)`);

  if (audience === "client") {
    const internal = elements.filter((e) => classes(e).includes("internal"));
    if (internal.length) errors.push(`client report contains ${internal.length} .internal block(s): remove them before sharing`);
    const evidence = elements.filter((e) => classes(e).includes("pill") && classes(e).some((c) => EVIDENCE.includes(c)));
    if (evidence.length) errors.push("client report contains evidence pills (observed/executed/inferred/unknown): rewrite as plain statements");
    if (ids.has("sources")) warnings.push("client report has a #sources section: keep it only if the client needs those references");
    const internalNames = new Set();
    for (const token of doc.tokens) {
      if (token.type !== "text" || token.raw || inComments(token)) continue;
      for (const match of source.slice(token.start, token.end).matchAll(INTERNAL_NAMES)) internalNames.add(match[0]);
    }
    for (const anchor of named("a")) if (/slack\.com\//i.test(attr(anchor, "href") || "")) internalNames.add("Slack links");
    if (internalNames.size) warnings.push(`client report mentions internal tools (${[...internalNames].join(", ")}), including in speaker notes: remove them unless the client should see them`);
    if (comments.threads.length && mode !== "export") {
      const open = comments.threads.filter((t) => t.status === "open").length;
      warnings.push(`client report stores ${comments.threads.length} review comment(s) (${open} open): \`report.mjs export\` removes them; delete them before sharing this file directly`);
    }
  }
  const charts = chartsIn(source, doc);
  charts.forEach((chart, index) => {
    const label = chart.caption ? `chart "${chart.caption.slice(0, 50)}"` : `chart ${index + 1}`;
    if (chart.error) errors.push(`${label} has invalid JSON: ${chart.error}`);
    if (!chart.figure) errors.push(`${label} must sit directly inside a <figure class="chart">`);
    else if (!chart.caption) warnings.push(`${label} has no <figcaption>; the caption is the chart's title`);
    if (chart.spec && chart.figure && (!chart.snapshot || attr(chart.snapshot, "data-hr-hash") !== chart.hash)) warnings.push(`${label} has a missing or stale snapshot for print and PDF: run \`report.mjs build\` with Chrome available`);
  });
  if (charts.length && !named("script").some((s) => attr(s, "data-hr-runtime") === "plotly")) warnings.push("charts are not interactive: run `report.mjs build` once with internet to download Plotly");
  diagramsIn(source, doc).forEach((diagram, index) => {
    if (!diagram.figure) errors.push(`diagram ${index + 1} must sit directly inside a <figure class="diagram">`);
    else if (!diagram.rendered || attr(diagram.rendered, "data-hr-hash") !== diagram.hash) warnings.push(`diagram ${index + 1} has a missing or stale drawing: run \`report.mjs build\` with Chrome available`);
  });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], template, audience };
}

const SLIDE_WORD_LIMIT = 70;

/** Deck rules: a cover first, a takeaway title on every slide, room to breathe, notes after slides. */
function checkDeck(doc, main, warnings) {
  const slides = main.children.filter((c) => classes(c).includes("slide"));
  if (!slides.length) {
    warnings.push('slides template has no <section class="slide"> inside <main class="deck">');
    return;
  }
  if (!classes(slides[0]).includes("cover")) warnings.push('the first slide should be the cover (<section class="slide cover">)');
  slides.forEach((slide, index) => {
    const label = attr(slide, "id") ? `#${attr(slide, "id")}` : `slide ${index + 1}`;
    const kinds = classes(slide);
    const title = slide.children.find((c) => c.name === "h1" || c.name === "h2");
    if (!title) warnings.push(`${label} has no <h2> title`);
    else if (!kinds.some((k) => ["cover", "divider"].includes(k)) && normalizeText(textContent(doc, title)).split(" ").length < 4) {
      warnings.push(`${label} title "${normalizeText(textContent(doc, title))}" is a label; state the slide's takeaway as a sentence`);
    }
    const words = normalizeText(visibleTextContent(doc, slide)).split(" ").filter(Boolean).length;
    if (words > SLIDE_WORD_LIMIT) warnings.push(`${label} has ${words} words (aim for ${SLIDE_WORD_LIMIT} or fewer); move detail into its notes or split the slide`);
  });
  main.children.forEach((child, index) => {
    if (classes(child).includes("notes") && !classes(main.children[index - 1] || { attrs: [] }).includes("slide")) {
      warnings.push("an <aside class=\"notes\"> must directly follow the slide it belongs to");
    }
  });
}

export function checkFile(file, options = {}) {
  return checkSource(readFileSync(file, "utf8"), { ...options, file });
}

