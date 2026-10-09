/* Slide deck runtime, appended to report.js for data-template="slides" only. Fits the
   960x540 slides to the column, flags slides whose content is cut off, and adds a present
   mode (P to start; arrows, Space, Home, End to move; N notes; F fullscreen; Esc to exit).
   On touch screens, present mode also takes swipes and taps (left third back, the rest
   forward), its controls hide when idle, and the browser's Back exits present mode.
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
  var stacked = false;
  var leaving = false;
  var idle = 0;
  var touch = null;
  var ui = doc.createElement("div");
  ui.className = "hr-deck-ui";
  ui.setAttribute("data-hr-ui", "");
  ui.innerHTML = '<button type="button" data-review data-act="present" title="Present (P)">&#9654; Present</button>' +
    '<button type="button" data-presenting data-act="prev" aria-label="Previous slide">&#8249;</button>' +
    '<span class="hr-count" data-presenting></span>' +
    '<button type="button" data-presenting data-act="next" aria-label="Next slide">&#8250;</button>' +
    '<button type="button" data-presenting data-act="notes" title="Speaker notes (N)">Notes</button>' +
    '<button type="button" data-presenting data-act="exit" title="Exit (Esc)">&#10005;</button>' +
    '<span class="hr-deck-hint">Turn your phone sideways for larger slides</span>';
  doc.body.appendChild(ui);
  var count = ui.querySelector(".hr-count");
  /* A play icon pinned to the right of the slide list, shown where the list is a top bar. */
  var toc = doc.querySelector(".toc");
  if (toc) {
    toc.insertAdjacentHTML("beforeend", '<button type="button" class="hr-toc-present" data-hr-ui aria-label="Present" title="Present (P)"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg></button>');
    toc.lastChild.addEventListener("click", function () { present(true); });
  }
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
    if (slides[index].id) { try { history.replaceState(history.state, "", "#" + slides[index].id); } catch (error) { /* sandboxed */ } }
  };
  var settle = function () {
    slides[index].scrollIntoView({ block: "start", behavior: "instant" });
    if (slides[index].id) { try { history.replaceState(null, "", "#" + slides[index].id); } catch (error) { /* sandboxed */ } }
  };
  var restore = function (mode) { try { history.scrollRestoration = mode; } catch (error) { /* sandboxed */ } };
  var wake = function () {
    root.classList.remove("hr-idle");
    clearTimeout(idle);
    if (presenting) { idle = setTimeout(function () { root.classList.add("hr-idle"); }, 3000); }
  };
  var visibleSlide = function () {
    var best = 0;
    slides.forEach(function (slide, i) { if (slide.getBoundingClientRect().top < window.innerHeight * 0.4) { best = i; } });
    return best;
  };
  /* Presenting adds a history entry so Back (a phone's back gesture) exits present mode
     instead of leaving the deck; exiting any other way removes that entry again. Scroll
     restoration is off until then, so review returns to the slide shown last. */
  var present = function (on, popped) {
    if (on === presenting) { return; }
    var start = on ? visibleSlide() : index;
    presenting = on;
    root.classList.toggle("hr-presenting", on);
    if (on) {
      restore("manual");
      try { history.replaceState({ hrDeck: "review" }, ""); history.pushState({ hrDeck: "present" }, ""); stacked = true; } catch (error) { stacked = false; restore("auto"); }
      show(start);
      wake();
      if (doc.fullscreenEnabled && root.requestFullscreen && !doc.fullscreenElement) {
        root.requestFullscreen().then(function () {
          var lock = screen.orientation && screen.orientation.lock;
          if (lock && window.matchMedia("(pointer: coarse)").matches) { return screen.orientation.lock("landscape"); }
        }).catch(function () {});
      }
    } else {
      root.classList.remove("hr-show-notes");
      root.classList.remove("hr-idle");
      slides.forEach(function (slide) { slide.classList.remove("hr-current"); });
      if (doc.fullscreenElement && doc.exitFullscreen) { doc.exitFullscreen().catch(function () {}); }
      if (stacked && !popped) { leaving = true; try { history.back(); } catch (error) { leaving = false; } }
      stacked = false;
    }
    fit();
    if (!on) { settle(); }
  };
  window.addEventListener("popstate", function () {
    var back = presenting && history.state && history.state.hrDeck === "review";
    if (back) { present(false, true); }
    if (back || leaving) { leaving = false; setTimeout(function () { settle(); restore("auto"); }, 0); }
  });
  ui.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    var act = button && button.getAttribute("data-act");
    wake();
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
  /* Touch: a horizontal swipe moves one slide; a tap moves back in the left third and forward
     elsewhere. Links, controls, and notes keep their taps, and nothing moves while zoomed in.
     The first tap near hidden controls only shows them. */
  deck.addEventListener("touchstart", function (event) {
    var point = event.touches[0];
    touch = presenting && event.touches.length === 1 ? { x: point.clientX, y: point.clientY, t: Date.now(), hidden: getComputedStyle(ui).pointerEvents === "none" } : null;
  }, { passive: true });
  deck.addEventListener("touchend", function (event) {
    var start = touch;
    touch = null;
    if (!presenting || !start || event.touches.length || (window.visualViewport && window.visualViewport.scale > 1.01)) { return; }
    var end = event.changedTouches[0];
    var dx = end.clientX - start.x;
    var dy = end.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { show(index + (dx < 0 ? 1 : -1)); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || Date.now() - start.t > 600) { return; }
    if (event.target.closest && event.target.closest("a, button, input, select, textarea, summary, label, [contenteditable], .notes")) { return; }
    event.preventDefault();
    var box = ui.getBoundingClientRect();
    if (start.hidden && end.clientY > box.top - 16 && end.clientX > box.left - 16 && end.clientX < box.right + 16) { return; }
    show(index + (end.clientX < window.innerWidth / 3 ? -1 : 1));
  }, { passive: false });
  doc.addEventListener("touchstart", function () { if (presenting) { wake(); } }, { passive: true });
  /* Leaving fullscreen restores the scroll position from before it (WebKit), so settle again. */
  doc.addEventListener("fullscreenchange", function () { fit(); if (!presenting && !doc.fullscreenElement) { settle(); } });
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
