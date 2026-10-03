import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_VERSION = "1.0.0";
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ASSETS_DIR = path.join(SKILL_DIR, "assets");

// Section ids each template expects, in reading order. Missing required ids are warnings:
// small reports may merge sections.
export const TEMPLATES = {
  plan: {
    required: ["scope", "questions", "sources", "current", "target", "phases", "qa", "acceptance", "risks", "handoff"],
    order: ["summary", "scope", "questions", "sources", "current", "target", "architecture", "phases", "rollout", "qa", "acceptance", "risks", "handoff"]
  },
  findings: {
    required: ["summary", "findings", "recommendation", "next"],
    order: ["summary", "scope", "findings", "impact", "options", "recommendation", "decisions", "next", "limits", "sources"]
  },
  brief: {
    required: ["summary", "decisions", "next"],
    order: ["summary", "overview", "decisions", "working", "visuals", "options", "risks", "phases", "next"]
  },
  // Decks are a sequence of <section class="slide">; check validates slides instead of ids.
  slides: { required: [], order: [], deck: true }
};

const STRING = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/;

/** Minify CSS outside of string literals: drop comments, collapse whitespace. */
export function minifyCss(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutComments
    .split(STRING)
    .map((part, index) => (index % 2 === 1 ? part : part
      .replace(/\s+/g, " ")
      .replace(/\s*([{};,>])\s*/g, "$1")
      .replace(/:\s+/g, ":")
      .replace(/\s+!important/g, "!important")
      .replace(/([\s:(,-])0\.(\d)/g, "$1.$2")))
    .join("")
    .replace(/;}/g, "}")
    .trim();
}

/** Join the runtime script onto one line. The source keeps block comments only. */
export function oneLineJs(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

const cache = new Map();
/** Runtime CSS/JS for a template: every report gets report.css/js; decks add deck.css/js. */
export function loadRuntime(template = null) {
  const deck = Boolean(TEMPLATES[template]?.deck);
  if (cache.has(deck)) return cache.get(deck);
  const read = (name) => readFileSync(path.join(ASSETS_DIR, name), "utf8");
  const css = minifyCss(read("report.css") + (deck ? `\n${read("deck.css")}` : ""));
  const js = oneLineJs(read("report.js")) + (deck ? ` ${oneLineJs(read("deck.js"))}` : "");
  if (/<\/(style|script)/i.test(css + js)) throw new Error("runtime assets must not contain closing style/script tags");
  const runtime = { css, js, classes: cssClasses(css) };
  cache.set(deck, runtime);
  return runtime;
}

/** Class names that the stylesheet defines selectors for: the component vocabulary. */
export function cssClasses(css) {
  const names = new Set();
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "").split(STRING).filter((_, index) => index % 2 === 0).join(" ");
  for (const match of code.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(match[1]);
  return names;
}
