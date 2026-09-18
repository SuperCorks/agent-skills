(() => {
  "use strict";

  const viewer = document.querySelector(".viewer");
  const panel = viewer.querySelector(".viewer-panel");
  const title = viewer.querySelector("#viewer-title");
  const position = viewer.querySelector(".viewer-position");
  const caption = viewer.querySelector("#viewer-caption");
  const image = viewer.querySelector(".viewer-image");
  const stage = viewer.querySelector(".viewer-stage");
  const previous = viewer.querySelector("[data-previous]");
  const next = viewer.querySelector("[data-next]");
  const navigation = viewer.querySelector(".viewer-navigation");
  const zoom = viewer.querySelector("[data-zoom]");
  const fullscreen = viewer.querySelector("[data-fullscreen]");
  const close = viewer.querySelector("[data-close]");
  const status = viewer.querySelector(".viewer-status");
  let images = [];
  let index = 0;
  let origin = null;
  let closing = false;

  function setZoom(enabled) {
    stage.classList.toggle("is-zoomed", enabled);
    zoom.setAttribute("aria-pressed", String(enabled));
    zoom.textContent = enabled ? "Fit image" : "Zoom in";
    // Two times the fitted size, or native resolution when larger.
    if (enabled) {
      const fitWidth = Math.min(stage.clientWidth - 32,
        (stage.clientHeight - 32) * image.naturalWidth / image.naturalHeight);
      image.style.width = `${Math.max(image.naturalWidth, fitWidth * 2)}px`;
    } else {
      image.style.width = "";
    }
    stage.scrollTo(0, 0);
  }

  function renderImage() {
    const item = images[index];
    setZoom(false);
    image.src = item.dataset.fullSrc;
    image.alt = item.querySelector("img").alt;
    caption.textContent = item.dataset.caption;
    position.textContent = `Image ${index + 1} of ${images.length}`;
    previous.disabled = index === 0;
    next.disabled = index === images.length - 1;
    navigation.hidden = images.length < 2;
    status.textContent = "";
    zoom.disabled = !image.complete || !image.naturalWidth;
  }

  image.addEventListener("load", () => { zoom.disabled = false; });
  image.addEventListener("error", () => {
    zoom.disabled = true;
    status.textContent = "This image could not be loaded. Its caption is still available.";
  });

  for (const button of document.querySelectorAll("[data-view-image]")) {
    button.addEventListener("click", () => {
      const story = button.closest("[data-story-id]");
      // Group by the owning story element, never by URL or a page-wide gallery.
      images = Array.from(story.querySelectorAll("[data-view-image]"));
      index = images.indexOf(button);
      origin = button;
      title.textContent = story.dataset.storyTitle;
      renderImage();
      viewer.showModal();
      document.body.style.overflow = "hidden";
      close.focus();
    });
  }

  function move(delta) {
    const candidate = index + delta;
    if (candidate >= 0 && candidate < images.length) {
      index = candidate;
      renderImage();
    }
  }
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  zoom.addEventListener("click", () => setZoom(!stage.classList.contains("is-zoomed")));

  async function closeViewer() {
    if (closing) return;
    closing = true;
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      viewer.close();
    } catch {
      status.textContent = "Exit fullscreen, then close the viewer.";
    } finally {
      closing = false;
    }
  }
  close.addEventListener("click", closeViewer);
  viewer.addEventListener("close", () => {
    document.body.style.overflow = "";
    origin?.focus({ preventScroll: true });
  });

  async function escapeViewer(event) {
    event.preventDefault();
    if (document.fullscreenElement === panel) {
      try { await document.exitFullscreen(); }
      catch { status.textContent = "Use the browser's fullscreen control to exit fullscreen."; }
    } else {
      await closeViewer();
    }
  }
  viewer.addEventListener("cancel", escapeViewer);
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const focusable = Array.from(panel.querySelectorAll(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.disabled && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.key === "Escape") {
      escapeViewer(event);
      return;
    }
    if (event.target.closest("input, textarea, select, [contenteditable]") ||
        event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  // The Fullscreen API rejects a dialog itself; its inner panel is eligible.
  fullscreen.hidden = !panel.requestFullscreen || !document.fullscreenEnabled;
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
      status.textContent = "";
    } catch {
      status.textContent = "Fullscreen is unavailable here. You can still use the enlarged viewer and zoom.";
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === panel;
    fullscreen.textContent = active ? "Exit fullscreen" : "Fullscreen";
    fullscreen.setAttribute("aria-pressed", String(active));
  });

  if (document.body.dataset.reviewNotes !== "yes") return;
  const atlasId = document.body.dataset.atlasId;
  const storageKey = (storyId) => `user-journey-atlas:v1:${atlasId}:${storyId}`;
  function downloadMarkdown(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (const notes of document.querySelectorAll(".review-notes")) {
    const story = notes.closest("[data-story-id]");
    const field = notes.querySelector("textarea");
    const noteStatus = notes.querySelector(".review-status");
    const key = storageKey(story.dataset.storyId);
    try {
      field.value = localStorage.getItem(key) || "";
      noteStatus.textContent = field.value ? "Saved in this browser." : "Notes save in this browser as you type.";
    } catch {
      noteStatus.textContent = "Browser storage is unavailable. Export notes before leaving this page.";
    }
    field.addEventListener("input", () => {
      try {
        localStorage.setItem(key, field.value);
        noteStatus.textContent = "Saved in this browser.";
      } catch {
        noteStatus.textContent = "Notes could not be saved. Export them before leaving this page.";
      }
    });
    notes.querySelector("[data-export-notes]").addEventListener("click", () => {
      const heading = story.dataset.storyTitle.replace(/[\r\n]+/g, " ");
      const text = `# ${heading}\n\nStory: ${story.dataset.storyId}\nAtlas: ${atlasId}\n\n${field.value}\n`;
      downloadMarkdown(`${atlasId}-${story.dataset.storyId}-notes.md`, text);
    });
  }
  document.querySelector("[data-export-atlas-notes]").addEventListener("click", () => {
    const catalog = JSON.parse(document.querySelector("[data-story-catalog]").textContent);
    const current = new Map(Array.from(document.querySelectorAll(".review-notes"), (notes) => [
      notes.closest("[data-story-id]").dataset.storyId, notes.querySelector("textarea").value,
    ]));
    const sections = [];
    let unavailable = false;
    for (const story of catalog) {
      let value = "";
      try { value = localStorage.getItem(storageKey(story.id)) || ""; }
      catch { unavailable = true; }
      if (current.has(story.id)) value = current.get(story.id);
      if (value.trim()) {
        const heading = story.title.replace(/[\r\n]+/g, " ");
        sections.push(`## ${heading}\n\nStory: ${story.id}\n\n${value}\n`);
      }
    }
    const warning = unavailable
      ? "Some saved notes could not be read. This export includes the notes available on this page.\n\n" : "";
    const text = `# Atlas review notes\n\nAtlas: ${atlasId}\n\n${warning}${sections.join("\n") || "No notes recorded.\n"}`;
    downloadMarkdown(`${atlasId}-notes.md`, text);
    document.querySelector(".atlas-review-status").textContent = unavailable
      ? "Browser storage is unavailable. Only notes available on this page were included."
      : "Download prepared with all saved notes for stories in this atlas.";
  });
})();
