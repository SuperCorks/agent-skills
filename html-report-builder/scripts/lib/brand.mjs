// Kernel brand kits (document contract §8). Kernel serves a kit as a bundle JSON; the build
// inlines its stylesheet as <style data-kernel-brand="<kit id>@<version>"> after the runtime style
// and puts its logo in the report's hero or the deck's cover. The runtime CSS falls back from the
// --brand-* custom properties, so pages pick the brand up from the stylesheet alone. Chart
// snapshots and diagrams, drawn at build time, read the same properties back from the inlined
// stylesheet, so a rebuild without --brand and `check` see the palette the first build used.
import { readFileSync } from "node:fs";
import { attr, escapeHtml } from "./scan.mjs";

export const BRAND_ATTR = "data-kernel-brand";
export const BRAND_LOGO = "brand-logo";
export const BUNDLE_FORMAT = 1;

const STAMP = /^[A-Za-z0-9._-]+@\d+$/;
const LOGO = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^()]*\))$/i;
const COLOR_TOKENS = ["accent", "on-accent", "ink", "muted", "page", "surface", "line", "ok", "warn", "risk"];

/**
 * A brand from the JSON Kernel serves: the bundle itself or the `{source, owner, kit}` of
 * `/tasks/{taskId}/brand-kit` and `…/brand-kit/bundle`, where `kit: null` means no brand (null),
 * either one inside the API's `{data}` envelope or not.
 */
export function parseBrand(value, label = "brand kit") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not a Kernel brand kit bundle`);
  /* The API wraps every response in {data}; a response saved as is reads the same. */
  if ("data" in value && !("stylesheet" in value) && value.data && typeof value.data === "object") value = value.data;
  const bundle = "kit" in value && !("stylesheet" in value) ? value.kit : value;
  if (bundle === null) return null;
  if (!bundle || typeof bundle !== "object") throw new Error(`${label} is not a Kernel brand kit bundle`);
  if (bundle.bundleFormat !== BUNDLE_FORMAT) {
    throw new Error(bundle.bundleFormat === undefined
      ? `${label} has no bundleFormat: save it from Kernel's brand-kit endpoint`
      : `${label} has bundleFormat ${JSON.stringify(bundle.bundleFormat)}, but this builder reads bundleFormat ${BUNDLE_FORMAT}: update the html-report-builder skill`);
  }
  const stamp = typeof bundle.stamp === "string" ? bundle.stamp : `${bundle.id}@${bundle.version}`;
  if (!STAMP.test(stamp)) throw new Error(`${label} has an invalid stamp ${JSON.stringify(stamp)} (expected <kit id>@<version>)`);
  if (typeof bundle.stylesheet !== "string") throw new Error(`${label} has no stylesheet`);
  if (bundle.stylesheet.includes("</")) throw new Error(`${label} stylesheet contains "</", which would end its <style>`);
  const logos = bundle.logos && typeof bundle.logos === "object" ? bundle.logos : {};
  const logo = (key) => {
    const uri = logos[key];
    if (uri === null || uri === undefined || uri === "") return null;
    if (typeof uri !== "string" || !LOGO.test(uri)) throw new Error(`${label} logos.${key} is not a base64 image data URI`);
    return uri;
  };
  const name = typeof bundle.name === "string" ? bundle.name : "";
  return {
    stamp, name, stylesheet: bundle.stylesheet,
    logos: { light: logo("light"), dark: logo("dark"), alt: typeof logos.alt === "string" && logos.alt.trim() ? logos.alt.trim() : name }
  };
}

export function loadBrandFile(file) {
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read the brand kit ${file}: ${error.message}`);
  }
  return parseBrand(value, `brand kit ${file}`);
}

export function brandStyleTag(brand) {
  return `<style ${BRAND_ATTR}="${escapeHtml(brand.stamp)}">${brand.stylesheet}</style>`;
}

/**
 * The logo block for the hero or cover, or null for a kit without one. With both logos, CSS shows
 * the one for the page's colour scheme (data-theme included) and prints the light one.
 */
export function brandLogoTag(brand) {
  const { light, dark, alt } = brand.logos;
  if (!light && !dark) return null;
  const img = (src, kind) => `<img${kind ? ` class="brand-logo-${kind}"` : ""} src="${src}" alt="${escapeHtml(alt)}">`;
  const images = light && dark && light !== dark ? img(light, "light") + img(dark, "dark") : img(light || dark);
  return `<div class="${BRAND_LOGO}" data-hr-generated="${BRAND_LOGO}">${images}</div>`;
}

/** The document's brand style: the first <style data-kernel-brand>. */
export function brandStyleIn(doc) {
  return doc.elements.find((e) => e.name === "style" && attr(e, BRAND_ATTR) !== null) || null;
}

/**
 * The brand stylesheet media drawing should follow: `brand` when the caller has one (null for
 * none), else the one inlined in the document.
 */
export function brandCssFor(source, doc, brand) {
  if (brand === null) return null;
  if (brand) return brand.stylesheet;
  const style = brandStyleIn(doc);
  return style ? source.slice(style.innerStart, style.innerEnd) : null;
}

/** Top-level rules of a stylesheet as {prelude, body}, skipping comments and strings. */
function topLevelRules(css) {
  const rules = [];
  let depth = 0;
  let prelude = "";
  let bodyStart = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      if (depth === 0) prelude += css.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "{") {
      if (depth++ === 0) bodyStart = i + 1;
    } else if (c === "}") {
      if (depth === 0) continue;
      if (--depth === 0) {
        rules.push({ prelude: prelude.trim(), body: css.slice(bodyStart, i) });
        prelude = "";
      }
    } else if (c === ";" && depth === 0) prelude = "";
    else if (depth === 0) prelude += c;
  }
  return rules;
}

/** Split on `separator` outside strings, comments, and parentheses. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      i = j;
    } else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** A colour's light and dark values: light-dark(a, b) splits; any other value is both. */
function colorPair(value) {
  const match = /^light-dark\(([\s\S]*)\)$/i.exec(value);
  const [light, dark] = match ? splitTopLevel(match[1], ",").map((v) => v.trim()) : [value, value];
  return { light: COLOR.test(light || "") ? light : null, dark: COLOR.test(dark || "") ? dark : null };
}

let cached = { css: null, theme: null };

/**
 * The concrete brand values build-time drawing needs, read from the stylesheet's top-level
 * `:root` rules (later declarations win, as in the cascade): colours per scheme, the series, the
 * font stacks, and the @font-face rules. Null when there is no brand stylesheet.
 */
export function brandTheme(css) {
  if (!css) return null;
  if (cached.css === css) return cached.theme;
  const props = {};
  const fontFaces = [];
  for (const rule of topLevelRules(css)) {
    if (/^@font-face$/i.test(rule.prelude)) fontFaces.push(`@font-face{${rule.body}}`);
    if (rule.prelude !== ":root") continue;
    for (const declaration of splitTopLevel(rule.body, ";")) {
      const match = /^\s*--brand-([a-z0-9-]+)\s*:([\s\S]*)$/i.exec(declaration);
      if (match) props[match[1].toLowerCase()] = match[2].replace(/\s*!important\s*$/i, "").trim();
    }
  }
  const theme = { light: { series: [] }, dark: { series: [] }, font: {}, fontFaces: fontFaces.join("\n") };
  const set = (key, value) => {
    const pair = colorPair(value);
    if (pair.light) theme.light[key] = pair.light;
    if (pair.dark) theme.dark[key] = pair.dark;
  };
  for (const token of COLOR_TOKENS) if (props[token]) set(token, props[token]);
  for (let n = 1; n <= 8; n++) {
    const pair = props[`series-${n}`] ? colorPair(props[`series-${n}`]) : {};
    theme.light.series.push(pair.light || null);
    theme.dark.series.push(pair.dark || null);
  }
  for (const role of ["body", "heading", "mono"]) {
    const stack = props[`font-${role}`];
    if (stack && !/[{};<>\\]|url\s*\(/i.test(stack)) theme.font[role] = stack;
  }
  cached = { css, theme };
  return theme;
}
