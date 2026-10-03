/* Slide deck runtime, appended to report.js for data-template="slides" only. Fits the
   960x540 slides to the column, flags slides whose content is cut off, and adds a present
   mode (P to start; arrows, Space, Home, End to move; N notes; F fullscreen; Esc to exit).
   Block comments only and a semicolon after every statement: the build joins lines. */
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;
  var deck = doc.querySelector("main.deck") || doc.querySelector("main");
  if (!deck) { return; }
  var slides = Array.prototype.filter.call(deck.children, function (node) { return node.classList.contains("slide"); });
  if (!slides.length) { return; }
  slides.forEach(function (slide, i) { slide.setAttribute("data-hr-n", String(i + 1)); });
  var W = 960;
  var H = 540;
  var index = 0;
  var presenting = false;
  var ui = doc.createElement("div");
  ui.className = "hr-deck-ui";
  ui.setAttribute("data-hr-ui", "");
  ui.innerHTML = '<button type="button" data-review data-act="present" title="Present (P)">&#9654; Present</button>' +
    '<button type="button" data-presenting data-act="prev" aria-label="Previous slide">&#8249;</button>' +
    '<span class="hr-count" data-presenting></span>' +
    '<button type="button" data-presenting data-act="next" aria-label="Next slide">&#8250;</button>' +
    '<button type="button" data-presenting data-act="notes" title="Speaker notes (N)">Notes</button>' +
    '<button type="button" data-presenting data-act="exit" title="Exit (Esc)">&#10005;</button>';
  doc.body.appendChild(ui);
  var count = ui.querySelector(".hr-count");
  var fit = function () {
    var scale = presenting ? Math.min(window.innerWidth / W, window.innerHeight / H) : Math.min(1.2, deck.clientWidth / W);
    root.style.setProperty("--hr-zoom", String(Math.max(0.2, Math.floor(scale * 1000) / 1000)));
  };
  var flag = function () {
    slides.forEach(function (slide) {
      var cut = slide.scrollHeight > slide.clientHeight + 2 || slide.scrollWidth > slide.clientWidth + 2;
      if (cut) { slide.setAttribute("data-hr-overflow", ""); } else { slide.removeAttribute("data-hr-overflow"); }
    });
  };
  var show = function (next) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach(function (slide, i) { slide.classList.toggle("hr-current", i === index); });
    count.textContent = (index + 1) + " / " + slides.length;
    if (slides[index].id) { try { history.replaceState(null, "", "#" + slides[index].id); } catch (error) { /* sandboxed */ } }
  };
  var visibleSlide = function () {
    var best = 0;
    slides.forEach(function (slide, i) { if (slide.getBoundingClientRect().top < window.innerHeight * 0.4) { best = i; } });
    return best;
  };
  var present = function (on) {
    if (on === presenting) { return; }
    var start = on ? visibleSlide() : index;
    presenting = on;
    root.classList.toggle("hr-presenting", on);
    if (on) {
      show(start);
      if (doc.fullscreenEnabled && root.requestFullscreen && !doc.fullscreenElement) { root.requestFullscreen().catch(function () {}); }
    } else {
      root.classList.remove("hr-show-notes");
      slides.forEach(function (slide) { slide.classList.remove("hr-current"); });
      if (doc.fullscreenElement && doc.exitFullscreen) { doc.exitFullscreen().catch(function () {}); }
    }
    fit();
    if (!on) { slides[index].scrollIntoView({ block: "start" }); }
  };
  ui.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    var act = button && button.getAttribute("data-act");
    if (act === "present") { present(true); }
    if (act === "exit") { present(false); }
    if (act === "prev") { show(index - 1); }
    if (act === "next") { show(index + 1); }
    if (act === "notes") { root.classList.toggle("hr-show-notes"); }
  });
  doc.addEventListener("keydown", function (event) {
    var target = event.target;
    if (event.metaKey || event.ctrlKey || event.altKey || (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) { return; }
    var key = event.key;
    if (!presenting) {
      if (key === "p" || key === "P") { event.preventDefault(); present(true); }
      return;
    }
    if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown" || key === " " || key === "Enter") { event.preventDefault(); show(index + 1); }
    else if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp" || key === "Backspace") { event.preventDefault(); show(index - 1); }
    else if (key === "Home") { event.preventDefault(); show(0); }
    else if (key === "End") { event.preventDefault(); show(slides.length - 1); }
    else if (key === "Escape") { event.preventDefault(); present(false); }
    else if (key === "n" || key === "N") { root.classList.toggle("hr-show-notes"); }
    else if (key === "f" || key === "F") {
      if (doc.fullscreenElement) { doc.exitFullscreen().catch(function () {}); } else if (doc.fullscreenEnabled && root.requestFullscreen) { root.requestFullscreen().catch(function () {}); }
    }
  });
  doc.addEventListener("fullscreenchange", function () { fit(); });
  window.addEventListener("resize", fit);
  if ("ResizeObserver" in window) { new ResizeObserver(function () { fit(); flag(); }).observe(deck); }
  if ("MutationObserver" in window) {
    var pending = 0;
    new MutationObserver(function () { clearTimeout(pending); pending = setTimeout(flag, 150); }).observe(deck, { subtree: true, childList: true, characterData: true });
  }
  window.addEventListener("load", flag);
  fit();
  flag();
})();
