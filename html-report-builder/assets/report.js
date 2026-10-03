/* html-report-builder runtime script. Progressive enhancement only: the page must read
   correctly with JavaScript off. The build joins trimmed lines with spaces, so use block
   comments only and end every statement with a semicolon. No network APIs. */
(function () {
  "use strict";
  var doc = document;
  var each = function (selector, fn) { Array.prototype.forEach.call(doc.querySelectorAll(selector), fn); };
  try {
    var toc = doc.querySelector(".toc");
    var links = toc ? toc.querySelectorAll("a[href^='#']") : [];
    if (links.length && "IntersectionObserver" in window) {
      var targets = new Map();
      var visible = new Set();
      Array.prototype.forEach.call(links, function (link) {
        var target = doc.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
        if (target) { targets.set(target, link); }
      });
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) { visible.add(entry.target); } else { visible.delete(entry.target); } });
        var current = null;
        targets.forEach(function (link, target) { if (!current && visible.has(target)) { current = link; } });
        if (!current) { return; }
        Array.prototype.forEach.call(links, function (link) {
          if (link === current) { link.setAttribute("aria-current", "true"); } else { link.removeAttribute("aria-current"); }
        });
        if (toc.scrollWidth > toc.clientWidth + 4) { toc.scrollTo({ left: Math.max(0, current.offsetLeft - 24) }); }
      }, { rootMargin: "-90px 0px -65% 0px" });
      targets.forEach(function (link, target) { observer.observe(target); });
    }
  } catch (error) { /* navigation highlighting is optional */ }
  try {
    each("pre", function (pre) {
      if (pre.closest(".device")) { return; }
      var button = doc.createElement("button");
      button.type = "button";
      button.className = "hr-copy";
      button.setAttribute("data-hr-ui", "");
      button.textContent = "Copy";
      button.addEventListener("click", function () {
        var clone = pre.cloneNode(true);
        Array.prototype.forEach.call(clone.querySelectorAll("[data-hr-ui]"), function (node) { node.remove(); });
        var done = function (ok) {
          button.textContent = ok ? "Copied" : "Copy failed";
          setTimeout(function () { button.textContent = "Copy"; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(clone.textContent).then(function () { done(true); }, function () { done(false); });
        } else { done(false); }
      });
      pre.appendChild(button);
    });
  } catch (error) { /* copy buttons are optional */ }
  try {
    var opened = [];
    window.addEventListener("beforeprint", function () {
      each("details:not([open])", function (details) { details.open = true; opened.push(details); });
    });
    window.addEventListener("afterprint", function () {
      opened.forEach(function (details) { details.open = false; });
      opened = [];
    });
  } catch (error) { /* print expansion is optional */ }
})();
