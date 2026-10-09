/* html-report-builder charts, appended to report.js only when a report has charts. Draws each
   <figure class="chart"> from its <script type="application/json" data-hr-chart> Plotly spec in
   the report's colours and fonts, replacing the build's static SVG snapshot (which stays for
   print, PDF, and readers without JavaScript). The build also loads this file to draw those
   snapshots. Strings "token:ink", "token:risk", "token:series-2" and so on in a spec become the
   report's colours. Block comments only and a semicolon after every statement: the build joins
   lines. */
(function () {
  "use strict";
  var doc = document;
  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var LIGHT = {
    ink: "#151922", muted: "#596273", line: "#dde1e8", surface: "#ffffff", sunken: "#eef0f4", accent: "#2155cf",
    ok: "#17703f", warn: "#9a5300", risk: "#b3261e", "series-1": "#2155cf", "series-2": "#eb6834", "series-3": "#1baf7a", "series-4": "#eda100", font: FONT
  };
  var NAMES = ["ink", "muted", "line", "surface", "sunken", "accent", "ok", "warn", "risk", "series-1", "series-2", "series-3", "series-4"];
  var CONFIG = { displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtons: [["toImage"]], toImageButtonOptions: { format: "png", scale: 2 } };
  var DECK_CONFIG = { displaylogo: false, responsive: true, displayModeBar: false };

  /* The report's resolved colours (light-dark() included), falling back to the light palette. */
  function tokens() {
    if (!doc.body) return LIGHT;
    var probe = doc.createElement("span");
    probe.style.display = "none";
    doc.body.appendChild(probe);
    var out = { font: getComputedStyle(doc.body).fontFamily || FONT };
    NAMES.forEach(function (name) {
      probe.style.color = "rgb(1, 2, 3)";
      probe.style.color = "var(--" + name + ", rgb(1, 2, 3))";
      var color = getComputedStyle(probe).color;
      out[name] = color && color !== "rgb(1, 2, 3)" ? color : LIGHT[name];
    });
    probe.remove();
    return out;
  }

  /* A guide line follows the pointer on line charts only; on bars it would cut through them. */
  function template(t, deck, spikes) {
    var size = deck ? 18 : 13;
    var axis = { gridcolor: t.line, linecolor: t.line, zeroline: false, ticks: "", tickfont: { color: t.muted }, title: { font: { color: t.muted } }, automargin: true, showspikes: false };
    var xaxis = spikes ? Object.assign({}, axis, { showspikes: true, spikemode: "across", spikethickness: 1, spikedash: "solid", spikecolor: t.muted, spikesnap: "cursor" }) : axis;
    return {
      layout: {
        font: { family: t.font, size: size, color: t.ink },
        colorway: [t["series-1"], t["series-2"], t["series-3"], t["series-4"]],
        paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: deck ? 24 : 16, r: 16, t: 16, b: deck ? 24 : 16, pad: 4 },
        xaxis: xaxis, yaxis: axis,
        legend: { orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom", traceorder: "normal", font: { color: t.muted } },
        hoverlabel: { bgcolor: t.surface, bordercolor: t.line, font: { color: t.ink, family: t.font, size: size } },
        bargap: 0.35, uniformtext: { mode: "hide", minsize: size - 2 },
        annotationdefaults: { font: { color: t.muted, size: size - 2 }, showarrow: false },
        shapedefaults: { line: { color: t.ink, width: 1 } }
      },
      data: { bar: [{ marker: { line: { width: 0 } }, cliponaxis: false, textangle: 0 }], scatter: [{ line: { width: 2 }, marker: { size: 8 } }] }
    };
  }

  /* Deep copy with "token:name" strings replaced by colours. */
  function resolve(value, t) {
    if (typeof value === "string") return value.indexOf("token:") === 0 && t[value.slice(6)] ? t[value.slice(6)] : value;
    if (Array.isArray(value)) return value.map(function (item) { return resolve(item, t); });
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (key) { out[key] = resolve(value[key], t); });
      return out;
    }
    return value;
  }

  /* Hover that suits the chart: a guide line with every series' value for lines over x, one
     row at a time for horizontal bars, otherwise the nearest point. A spec's own wins. */
  function hoverFor(data) {
    var lines = data.some(function (trace) { return (trace.type || "scatter") === "scatter" && String(trace.mode || "lines").indexOf("lines") >= 0; });
    var horizontal = data.length > 0 && data.every(function (trace) { return trace.type === "bar" && trace.orientation === "h"; });
    return lines ? "x unified" : horizontal ? "y unified" : "closest";
  }

  function figureFor(spec, t, deck) {
    var data = resolve(spec.data || [], t);
    var layout = resolve(spec.layout || {}, t);
    if (!layout.hovermode) layout.hovermode = hoverFor(data);
    layout.template = template(t, deck, layout.hovermode === "x unified");
    if (!layout.height) layout.height = deck ? 280 : 320;
    return { data: data, layout: layout };
  }

  /* Labels beside bars and points can run past the right edge on narrow screens. Widen the
     right margin just enough: a label starting a fraction f across the plot moves left by f
     for each pixel the plot loses. Axis labels can shift too, so it checks up to three times. */
  function roomForText(gd, tries) {
    tries = tries === undefined ? 3 : tries;
    var full = gd._fullLayout;
    var svg = gd.querySelector(".main-svg");
    if (!full || !svg) return null;
    var box = svg.getBoundingClientRect();
    var scale = box.width / full.width || 1;
    var size = full._size;
    var need = 0;
    Array.prototype.forEach.call(gd.querySelectorAll(".bartext, .textpoint text"), function (text) {
      var r = text.getBoundingClientRect();
      var over = (r.right - box.left) / scale - (full.width - 4);
      if (over <= 0 || !r.width) return;
      var start = Math.max(0.2, ((r.left - box.left) / scale - size.l) / size.w);
      need = Math.max(need, over / start);
    });
    if (!need || !tries) return null;
    return window.Plotly.relayout(gd, { "margin.r": full.margin.r + Math.ceil(Math.min(need, size.w * 0.6)) }).then(function () { return roomForText(gd, tries - 1); });
  }

  /* Slides chart at their 960px design size, or like a report when a phone reflows them. */
  function deckSized(figure) {
    var slide = figure.closest(".slide");
    return Boolean(slide) && slide.offsetWidth >= 900;
  }

  function specOf(figure) {
    var node = figure.querySelector("script[data-hr-chart]");
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (error) { return null; }
  }

  /* Slides scale with CSS zoom, which Plotly's pointer maths does not follow. The plot cancels
     the zoom and is scaled back with a transform, which Plotly does follow, so hover lands on the
     right point and the chart keeps the slide's design size. */
  function zoomOf(element) {
    return "currentCSSZoom" in element ? element.currentCSSZoom : element.offsetWidth ? element.getBoundingClientRect().width / element.offsetWidth : 1;
  }

  function fit(live) {
    var plot = live.firstChild;
    var zoom = zoomOf(live);
    var scaled = zoom > 0 && Math.abs(zoom - 1) > 0.001;
    plot.style.zoom = scaled ? String(1 / zoom) : "";
    plot.style.transform = scaled ? "scale(" + zoom + ")" : "";
    plot.style.width = scaled ? live.offsetWidth + "px" : "";
  }

  function draw(figure, t) {
    var spec = specOf(figure);
    if (!spec || !window.Plotly) return;
    var deck = deckSized(figure);
    var live = figure.querySelector(".chart-live");
    if (!live) {
      live = doc.createElement("div");
      live.className = "chart-live";
      live.setAttribute("data-hr-ui", "");
      live.appendChild(doc.createElement("div")).className = "chart-plot";
      figure.insertBefore(live, figure.querySelector(".chart-static") || figure.querySelector("figcaption"));
    }
    var built = figureFor(spec, t, deck);
    live.style.height = built.layout.height + "px";
    fit(live);
    try {
      window.Plotly.react(live.firstChild, built.data, built.layout, deck ? DECK_CONFIG : CONFIG).then(function (gd) { return roomForText(gd); }).then(function () { figure.classList.add("is-live"); }, function () { figure.classList.remove("is-live"); });
    } catch (error) {
      figure.classList.remove("is-live");
    }
  }

  /* Draws each chart whose width, zoom, size, or colours changed since it was last drawn.
     Hidden charts (other slides while presenting) wait until they show. */
  function drawAll() {
    var figures = doc.querySelectorAll("figure.chart");
    if (!figures.length || !window.Plotly) return;
    var t = tokens();
    Array.prototype.forEach.call(figures, function (figure) {
      if (!figure.clientWidth) return;
      var state = [figure.clientWidth, zoomOf(figure), deckSized(figure), t.ink, t.surface, t.accent].join("|");
      if (figure.hrChartState === state) return;
      figure.hrChartState = state;
      draw(figure, t);
    });
  }

  /* Used by the build: an SVG snapshot of one spec in the light palette. */
  function snapshot(spec, options) {
    var deck = Boolean(options && options.deck);
    var width = (options && options.width) || (deck ? 832 : 880);
    var holder = doc.createElement("div");
    holder.style.width = width + "px";
    doc.body.appendChild(holder);
    var built = figureFor(spec, LIGHT, deck);
    built.layout.width = width;
    return window.Plotly.newPlot(holder, built.data, built.layout, { staticPlot: true }).then(function (gd) {
      return Promise.resolve(roomForText(gd)).then(function () { return window.Plotly.toImage(gd, { format: "svg", width: width, height: built.layout.height }); });
    }).then(function (url) {
      window.Plotly.purge(holder);
      holder.remove();
      var comma = url.indexOf(",");
      var body = url.slice(comma + 1);
      return url.slice(0, comma).indexOf(";base64") >= 0 ? atob(body) : decodeURIComponent(body);
    });
  }

  /* Redraws every chart, for callers that changed a spec. */
  function redraw() {
    Array.prototype.forEach.call(doc.querySelectorAll("figure.chart"), function (figure) { figure.hrChartState = ""; });
    drawAll();
  }

  window.HRCharts = { draw: redraw, snapshot: snapshot, tokens: tokens };
  if (!window.Plotly || !doc.querySelector("figure.chart")) return;
  drawAll();
  var scheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (scheme && scheme.addEventListener) scheme.addEventListener("change", drawAll);
  /* Check again after a resize, a colour-scheme or theme change, and when the deck changes its
     zoom (presenting, window size). */
  var pending = 0;
  function refit() {
    clearTimeout(pending);
    pending = setTimeout(drawAll, 100);
  }
  window.addEventListener("resize", refit);
  if ("MutationObserver" in window) new MutationObserver(refit).observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  if ("ResizeObserver" in window) {
    var observer = new ResizeObserver(refit);
    Array.prototype.forEach.call(doc.querySelectorAll("figure.chart"), function (figure) { observer.observe(figure); });
  }
})();
