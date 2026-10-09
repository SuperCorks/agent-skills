// Mermaid diagrams at build time. Each <figure class="diagram"> holds its source in
// <script type="text/x-mermaid" data-hr-diagram>; the build keeps a light and a dark SVG
// (<div class="diagram-svg" data-hr-generated="diagram">) right after it, redrawn only when the
// source or theme changes. Nodes in class "new" get a heavier green border; "retired" nodes are
// dashed and struck through, so meaning never rests on colour alone.
import { createHash } from "node:crypto";
import { attr, parse, splice } from "./scan.mjs";
import { removeElementLine } from "./charts.mjs";

export const DIAGRAM_THEME_VERSION = "diagrams-2";
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
// Mermaid scales a wide diagram down to its column; below 40rem it scrolls sideways instead,
// so labels stay readable on phones.
export const scrollable = (svg) => svg.replace(/(<svg\b[^>]*?\bstyle="[^"]*?)max-width: ?([\d.]+)px;?/, (_, head, width) => `${head}max-width: ${width}px; min-width: min(${width}px, 40rem);`);

const PALETTES = {
  light: { node: "#ffffff", text: "#151922", border: "#c5ccd8", line: "#596273", cluster: "#eef0f4", clusterBorder: "#dde1e8", muted: "#596273", label: "#f5f6f8", ok: "#17703f", accent: "#2155cf" },
  dark: { node: "#171a21", text: "#e7e9ee", border: "#3a404d", line: "#9ba4b4", cluster: "#1f232c", clusterBorder: "#2b303b", muted: "#9ba4b4", label: "#0e1014", ok: "#63cf91", accent: "#84a6ff" }
};

/** Mermaid configuration for one colour scheme. */
export function mermaidConfig(scheme) {
  const p = PALETTES[scheme];
  return {
    startOnLoad: false, theme: "base", securityLevel: "strict", htmlLabels: false, fontFamily: FONT,
    flowchart: { htmlLabels: false, curve: "basis", padding: 12, nodeSpacing: 32, rankSpacing: 44, useMaxWidth: true },
    themeVariables: {
      fontFamily: FONT, fontSize: "15px", background: "transparent",
      primaryColor: p.node, primaryTextColor: p.text, primaryBorderColor: p.border, nodeBorder: p.border, nodeTextColor: p.text,
      lineColor: p.line, textColor: p.text, secondaryColor: p.cluster, tertiaryColor: p.label,
      clusterBkg: p.cluster, clusterBorder: p.clusterBorder, titleColor: p.muted, edgeLabelBackground: p.label
    },
    themeCSS: [
      `.node.new rect, .node.new polygon, .node.new circle, .node.new path { stroke: ${p.ok} !important; stroke-width: 2.5px !important; }`,
      `.node.retired rect, .node.retired polygon, .node.retired circle, .node.retired path { stroke-dasharray: 5 4 !important; }`,
      `.node.retired text, .node.retired tspan { text-decoration: line-through; opacity: .75; }`,
      `.node.accent rect, .node.accent polygon { stroke: ${p.accent} !important; stroke-width: 2.5px !important; }`,
      `.cluster-label text, .cluster-label tspan { font-weight: 650; }`
    ].join("\n")
  };
}

export function diagramsIn(source, doc = parse(source)) {
  return doc.elements.filter((e) => e.name === "script" && attr(e, "data-hr-diagram") !== null).map((script) => {
    const figure = script.parent && script.parent.name === "figure" ? script.parent : null;
    const text = source.slice(script.innerStart, script.innerEnd).trim();
    const rendered = figure && figure.children.find((c) => c.name === "div" && attr(c, "data-hr-generated") === "diagram");
    return { script, figure, text, rendered: rendered || null, hash: hash(`${DIAGRAM_THEME_VERSION}\n${JSON.stringify([mermaidConfig("light"), mermaidConfig("dark")])}\n${text}`) };
  });
}

/**
 * Insert, refresh, or remove rendered diagrams. `render(items)` gets [{source, id}] for stale
 * diagrams and returns [{light, dark}] SVG strings in the same order.
 */
export async function renderDiagrams(source, { render, force = false }) {
  const doc = parse(source);
  const diagrams = diagramsIn(source, doc);
  const notes = diagrams.filter((d) => !d.figure).map(() => 'a data-hr-diagram source is not inside a <figure class="diagram">');
  const edits = [];
  const kept = new Set(diagrams.map((d) => d.rendered).filter(Boolean));
  for (const div of doc.elements.filter((e) => e.name === "div" && attr(e, "data-hr-generated") === "diagram" && !kept.has(e))) edits.push(removeElementLine(source, div));
  const stale = diagrams.filter((d) => d.figure && d.text && (force || !d.rendered || attr(d.rendered, "data-hr-hash") !== d.hash));
  let rendered = 0;
  if (stale.length) {
    let svgs = null;
    try {
      svgs = await render(stale.map((d) => ({ source: d.text, id: `hrd-${d.hash}` })));
    } catch (error) {
      notes.push(`diagrams were not updated: ${error.message}`);
    }
    if (svgs) {
      stale.forEach((diagram, i) => {
        if (svgs[i].error) { notes.push(`a diagram could not be drawn: ${svgs[i].error}`); return; }
        const block = `<div class="diagram-svg" data-hr-generated="diagram" data-hr-hash="${diagram.hash}"><div class="diagram-light">${scrollable(svgs[i].light)}</div><div class="diagram-dark">${scrollable(svgs[i].dark)}</div></div>`;
        if (diagram.rendered) edits.push({ start: diagram.rendered.start, end: diagram.rendered.end, text: block });
        else edits.push({ start: diagram.script.end, end: diagram.script.end, text: block });
        rendered++;
      });
    }
  }
  return { source: edits.length ? splice(source, edits) : source, notes, rendered, diagrams: diagrams.length };
}

/** Browser renderer for diagrams: Mermaid in one blank page, drawn once per colour scheme. */
export function diagramRenderer(page, { mermaid }) {
  let ready = null;
  return async (items) => {
    ready ??= (async () => {
      await page.setContent("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
      await page.addScriptTag({ content: mermaid });
    })();
    await ready;
    const out = [];
    for (const item of items) {
      const result = {};
      for (const scheme of ["light", "dark"]) {
        const drawn = await page.evaluate(async ({ source, id, config }) => {
          try {
            window.mermaid.initialize(config);
            const { svg } = await window.mermaid.render(id, source);
            return { svg };
          } catch (error) {
            return { error: String(error && error.message || error).split("\n")[0] };
          }
        }, { source: item.source, id: `${item.id}-${scheme}`, config: mermaidConfig(scheme) });
        if (drawn.error) { result.error = drawn.error; break; }
        result[scheme] = drawn.svg;
      }
      out.push(result);
    }
    return out;
  };
}
