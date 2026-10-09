// The asynchronous part of `report.mjs build`: draws stale chart snapshots and Mermaid diagrams
// in headless Chrome, and makes sure Plotly is cached so the synchronous build can inline it.
// Without a network or a browser the build still succeeds, keeping what it has and noting why.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chartRenderer, chartsIn, renderChartSnapshots } from "./charts.mjs";
import { diagramRenderer, diagramsIn, renderDiagrams } from "./diagrams.mjs";
import { ASSETS_DIR } from "./runtime.mjs";
import { attr, parse } from "./scan.mjs";
import { ensureLibrary, withBrowser } from "./vendor.mjs";

export const chartsJs = () => readFileSync(path.join(ASSETS_DIR, "charts.js"), "utf8");

export async function renderMedia(source, { force = false, runBrowser = withBrowser, loadLibrary = ensureLibrary } = {}) {
  const notes = [];
  const doc = parse(source);
  const charts = chartsIn(source, doc);
  const diagrams = diagramsIn(source, doc);
  const staleCharts = charts.some((c) => c.spec && c.figure && (force || !c.snapshot || attr(c.snapshot, "data-hr-hash") !== c.hash));
  const staleDiagrams = diagrams.some((d) => d.figure && d.text && (force || !d.rendered || attr(d.rendered, "data-hr-hash") !== d.hash));
  const load = async (name) => {
    try { return readFileSync(await loadLibrary(name), "utf8"); } catch (error) { notes.push(error.message); return null; }
  };
  const plotly = charts.length ? await load("plotly") : null;
  const mermaid = staleDiagrams ? await load("mermaid") : null;
  const unavailable = (what) => async () => { throw new Error(`${what} is not available`); };
  let next = source;
  const draw = async (chartPage, diagramPage) => {
    const chartResult = await renderChartSnapshots(next, { force, render: plotly && chartPage ? chartRenderer(chartPage, { plotly, chartsJs: chartsJs() }) : unavailable("Plotly") });
    next = chartResult.source;
    notes.push(...chartResult.notes);
    const diagramResult = await renderDiagrams(next, { force, render: mermaid && diagramPage ? diagramRenderer(diagramPage, { mermaid }) : unavailable("Mermaid") });
    next = diagramResult.source;
    notes.push(...diagramResult.notes);
    return { charts: chartResult.rendered, diagrams: diagramResult.rendered };
  };
  let drawn = { charts: 0, diagrams: 0 };
  if ((staleCharts && plotly) || (staleDiagrams && mermaid)) {
    try {
      drawn = await runBrowser(async (browser) => draw(await browser.newPage(), await browser.newPage()));
    } catch (error) {
      notes.push(`charts and diagrams were not redrawn: ${error.message}`);
      drawn = await draw(null, null);
    }
  } else drawn = await draw(null, null);
  return { source: next, changed: next !== source, notes: [...new Set(notes)], drawn, charts: charts.length, diagrams: diagrams.length };
}

export async function renderMediaFile(file, options = {}) {
  const source = readFileSync(file, "utf8");
  const result = await renderMedia(source, options);
  if (result.changed) writeFileSync(file, result.source);
  return result;
}
