// Plotly charts at build time. Each <figure class="chart"> holds its spec in
// <script type="application/json" data-hr-chart>; the build keeps a static SVG snapshot of it
// (<img class="chart-static" data-hr-generated="chart">) right after the spec, refreshed only
// when the spec or theme changes. The page swaps in the interactive chart; print and PDF use
// the snapshot. With a Kernel brand kit, snapshots use the brand's light colours, series, and body
// font, read from the inlined brand stylesheet.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { brandCssFor, brandTheme } from "./brand.mjs";
import { ASSETS_DIR } from "./runtime.mjs";
import { ancestors, attr, classes, escapeHtml, normalizeText, parse, splice, textContent } from "./scan.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
// Snapshots follow the chart theme: any change to charts.js redraws them on the next build.
let themeHash = null;
export const chartThemeHash = () => (themeHash ??= hash(readFileSync(path.join(ASSETS_DIR, "charts.js"), "utf8")));

/** Edit removing an element and, when it sits alone on its line, the line. */
export function removeElementLine(source, element) {
  let start = element.start;
  let end = element.end;
  while (start > 0 && (source[start - 1] === " " || source[start - 1] === "\t")) start--;
  if (source[end] === "\n" && (start === 0 || source[start - 1] === "\n")) end++;
  return { start, end, text: "" };
}

const CHART_COLORS = ["ink", "muted", "line", "surface", "accent", "ok", "warn", "risk"];

/**
 * The chart tokens a brand overrides for snapshots ("token:name" names, as charts.js uses), or
 * null without a brand that sets any: unbranded snapshots keep their hashes.
 */
export function chartBrandTokens(theme) {
  if (!theme) return null;
  const tokens = {};
  for (const name of CHART_COLORS) if (theme.light[name]) tokens[name] = theme.light[name];
  theme.light.series.forEach((color, index) => { if (color) tokens[`series-${index + 1}`] = color; });
  if (theme.font.body) tokens.font = theme.font.body;
  return Object.keys(tokens).length ? tokens : null;
}

/**
 * Every chart spec with its figure, caption, snapshot, and the hash its snapshot should carry.
 * `brand` (a parsed bundle, or null for none) stands in for the brand inlined in the source.
 */
export function chartsIn(source, doc = parse(source), { brand } = {}) {
  const theme = chartBrandTokens(brandTheme(brandCssFor(source, doc, brand)));
  const branded = theme ? `${JSON.stringify(theme)}\n` : "";
  return doc.elements.filter((e) => e.name === "script" && attr(e, "data-hr-chart") !== null).map((script) => {
    const figure = script.parent && script.parent.name === "figure" ? script.parent : null;
    const text = source.slice(script.innerStart, script.innerEnd);
    const deck = ancestors(script).some((a) => classes(a).includes("slide"));
    const caption = figure && figure.children.find((c) => c.name === "figcaption");
    const snapshot = figure && figure.children.find((c) => c.name === "img" && attr(c, "data-hr-generated") === "chart");
    let spec = null;
    let error = null;
    try {
      spec = JSON.parse(text);
      if (!spec || typeof spec !== "object" || !Array.isArray(spec.data)) throw new Error('expected {"data": [...], "layout": {...}}');
    } catch (failure) {
      spec = null;
      error = failure.message;
    }
    return {
      script, figure, text, spec, error, deck, theme, snapshot: snapshot || null,
      caption: caption ? normalizeText(textContent(doc, caption)) : "",
      hash: hash(`${chartThemeHash()}\n${deck}\n${branded}${text.trim()}`)
    };
  });
}

/**
 * Insert, refresh, or remove chart snapshots. `render(items)` gets [{spec, deck}] (plus `theme`,
 * the brand's tokens, when the report has a brand) for the charts whose snapshot is missing or
 * stale and returns SVG strings in the same order.
 */
export async function renderChartSnapshots(source, { render, force = false, brand }) {
  const doc = parse(source);
  const charts = chartsIn(source, doc, { brand });
  const notes = charts.filter((c) => c.error).map((c) => `a chart's JSON is invalid (${c.error})`);
  notes.push(...charts.filter((c) => !c.figure).map(() => "a data-hr-chart spec is not inside a <figure class=\"chart\">"));
  const edits = [];
  const kept = new Set(charts.map((c) => c.snapshot).filter(Boolean));
  for (const img of doc.elements.filter((e) => e.name === "img" && attr(e, "data-hr-generated") === "chart" && !kept.has(e))) edits.push(removeElementLine(source, img));
  const stale = charts.filter((c) => c.spec && c.figure && (force || !c.snapshot || attr(c.snapshot, "data-hr-hash") !== c.hash));
  let rendered = 0;
  if (stale.length) {
    let svgs = null;
    try {
      svgs = await render(stale.map((c) => (c.theme ? { spec: c.spec, deck: c.deck, theme: c.theme } : { spec: c.spec, deck: c.deck })));
    } catch (error) {
      notes.push(`chart snapshots were not updated: ${error.message}`);
    }
    if (svgs) {
      stale.forEach((chart, i) => {
        const tag = `<img class="chart-static" data-hr-generated="chart" data-hr-hash="${chart.hash}" alt="${escapeHtml(chart.caption || "Chart")}" src="data:image/svg+xml;base64,${Buffer.from(svgs[i]).toString("base64")}">`;
        if (chart.snapshot) edits.push({ start: chart.snapshot.start, end: chart.snapshot.end, text: tag });
        else edits.push({ start: chart.script.end, end: chart.script.end, text: tag });
      });
      rendered = stale.length;
    }
  }
  return { source: edits.length ? splice(source, edits) : source, notes, rendered, charts: charts.length };
}

/** Browser renderer for snapshots: Plotly and charts.js loaded into one blank page. */
export function chartRenderer(page, { plotly, chartsJs }) {
  let ready = null;
  return async (items) => {
    ready ??= (async () => {
      await page.setContent("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
      await page.addScriptTag({ content: plotly });
      await page.addScriptTag({ content: chartsJs });
    })();
    await ready;
    const svgs = [];
    for (const item of items) svgs.push(await page.evaluate(({ spec, deck, theme }) => window.HRCharts.snapshot(spec, { deck, theme }), item));
    return svgs;
  };
}
