// Injected into the served report by report-editor.mjs; never saved into the file.
// Click a block to edit its text; select a paragraph or section and press "Rewrite with AI"
// (Cmd+K) to propose a model rewrite, review the diff, then accept or discard it. Click beside
// the text to select its card or section; Delete removes the selection (Undo brings it back).
(() => {
  "use strict";
  const stateNode = document.getElementById("hre-state");
  let version = JSON.parse(stateNode ? stateNode.textContent : "{}").version;
  let state = null;
  let editing = null;
  let selected = null;
  let scope = null;
  let hovered = null;
  let proposal = null;
  let running = null;
  let pending = 0;
  let lastInstruction = "";
  let saveQueue = Promise.resolve();
  const SCROLL_KEY = `hre-scroll:${location.pathname}`;
  const FLASH_KEY = `hre-flash:${location.pathname}`;
  const CHIPS = [
    ["Shorter", "Make this shorter and tighter without losing any facts, numbers, or decisions."],
    ["Clearer", "Make this clearer and less technical for a non-specialist reader."],
    ["Bold key phrases", "Bold (<strong>) only the phrases that matter for the reader's next decision; do not change the wording."],
    ["Fix grammar", "Fix grammar, spelling, and punctuation only."],
    ["Client voice", "Rewrite for a client reader: plain language, company voice (Red Krypton), no internal notes or tool names."]
  ];

  const savedScroll = sessionStorage.getItem(SCROLL_KEY);
  if (savedScroll !== null) {
    sessionStorage.removeItem(SCROLL_KEY);
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const target = Number(savedScroll);
    window.scrollTo(0, target);
    window.addEventListener("load", () => window.scrollTo(0, target));
  }
  const reload = () => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    location.reload();
  };

  async function request(path, body, { method = "POST", signal } = {}) {
    pending++;
    try {
      const response = await fetch(path, {
        method, signal, credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body || {})
      });
      let data = {};
      try { data = await response.json(); } catch { /* empty body */ }
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return data;
    } finally {
      pending--;
    }
  }

  // ----- UI shell (shadow DOM keeps the report's CSS and ours apart) -----
  const host = document.createElement("div");
  host.id = "hre-host";
  host.setAttribute("data-hr-ui", "");
  const spacer = document.createElement("div");
  spacer.setAttribute("data-hr-ui", "");
  spacer.style.cssText = "height:96px;grid-column:1 / -1";
  document.body.append(spacer, host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <link rel="stylesheet" href="/__hre/toolbar.css">
    <div class="banner" id="banner" hidden>The file changed on disk. <button id="banner-reload">Reload</button></div>
    <div class="toast" id="toast" role="status" hidden></div>
    <section class="panel" id="panel" hidden aria-label="Rewrite with AI">
      <header><strong id="panel-title">Rewrite with AI</strong><button id="panel-close" aria-label="Close">×</button></header>
      <div id="compose">
        <textarea id="instruction" placeholder="Tell the AI what to change in the highlighted part…"></textarea>
        <div class="chips" id="chips"></div>
        <div class="row"><span class="meta" id="compose-meta"></span><button class="primary" id="run">Rewrite <kbd>⌘↵</kbd></button></div>
      </div>
      <div id="busy" hidden><div class="spinner"></div><span id="busy-text">Working…</span><button id="cancel">Cancel</button></div>
      <div id="result" hidden>
        <p class="meta" id="result-meta"></p>
        <div class="diff" id="diff"></div>
        <div class="row"><button id="discard">Discard</button><button id="retry">Retry</button><button class="primary" id="accept">Accept</button></div>
      </div>
      <p class="error" id="error" hidden></p>
    </section>
    <section class="settings" id="settings" hidden aria-label="AI settings">
      <label>Provider <select id="provider"></select></label>
      <label>Model <input id="model" list="models" spellcheck="false"><datalist id="models"></datalist></label>
      <label>Effort <select id="effort"></select></label>
      <div class="row"><button id="settings-cancel">Cancel</button><button class="primary" id="settings-save">Save</button></div>
    </section>
    <nav class="bar" aria-label="Report editor">
      <span class="status"><span class="dot" id="dot"></span><span id="status">Click any text to edit</span></span>
      <span class="sep"></span>
      <span class="crumbs" id="crumbs"></span>
      <button class="primary" id="ai" disabled title="Rewrite the highlighted part with AI (⌘K)">✦ Rewrite with AI</button>
      <button class="danger" id="delete" disabled title="Delete the highlighted part (⌫)">Delete</button>
      <span class="sep"></span>
      <button id="undo" disabled title="Undo (⌘Z)">Undo</button>
      <button id="redo" disabled title="Redo (⇧⌘Z)">Redo</button>
      <button id="gear" title="AI settings"><span id="model-label">AI</span></button>
    </nav>`;
  const $ = (id) => root.getElementById(id);
  const show = (id, visible) => { $(id).hidden = !visible; };
  let toastTimer;
  const toast = (message) => {
    $("toast").textContent = message;
    show("toast", true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show("toast", false), 4000);
  };
  const setStatus = (kind, text) => {
    $("dot").className = `dot ${kind}`;
    $("status").textContent = text;
  };
  const updateHistory = (data) => {
    if (typeof data.canUndo === "boolean") $("undo").disabled = !data.canUndo;
    if (typeof data.canRedo === "boolean") $("redo").disabled = !data.canRedo;
  };
  const inUi = (node) => node === host || host.contains(node);
  const isBlock = (node) => node && node.dataset && /^b\d+$/.test(node.dataset.hre || "");
  const canDelete = (node) => !!node && node.hasAttribute("data-hre-del");
  const labelOf = (element) => {
    const id = element.id ? `#${element.id}` : "";
    const cls = [...element.classList].find((c) => !c.startsWith("hre-"));
    return `${element.tagName.toLowerCase()}${id || (cls ? `.${cls}` : "")}`;
  };
  const textOf = (element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("[data-hr-ui]").forEach((node) => node.remove());
    return clone.textContent;
  };
  const innerOf = (element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("[data-hr-ui]").forEach((node) => node.remove());
    const html = clone.innerHTML;
    return html === "<br>" ? "" : html;
  };

  // ----- selection and scope -----
  function select(block) {
    if (scope && scope !== block) scope.classList.remove("hre-scope");
    selected = block;
    scope = block;
    renderCrumbs();
  }
  function selectScope(element) {
    if (scope && scope !== element) scope.classList.remove("hre-scope");
    selected = element;
    setScope(element);
    setStatus("", canDelete(element) ? `${labelOf(element)} selected · ⌫ deletes` : `${labelOf(element)} selected`);
  }
  function clearSelection() {
    if (scope) scope.classList.remove("hre-scope", "hre-doomed");
    selected = null;
    scope = null;
    renderCrumbs();
  }
  function setScope(element) {
    if (scope) scope.classList.remove("hre-scope", "hre-doomed");
    scope = element;
    if (scope && scope !== editing?.el) scope.classList.add("hre-scope");
    renderCrumbs();
  }
  function renderCrumbs() {
    const crumbs = $("crumbs");
    crumbs.textContent = "";
    $("ai").disabled = !scope;
    $("delete").disabled = !canDelete(scope);
    if (!selected) return;
    const chain = [];
    for (let node = selected; node && node !== document.body && chain.length < 6; node = node.parentElement) {
      if (node.dataset && node.dataset.hre) chain.push(node);
    }
    chain.reverse().forEach((element, index) => {
      if (index) crumbs.append(Object.assign(document.createElement("span"), { className: "chev", textContent: "›" }));
      const button = Object.assign(document.createElement("button"), { className: `crumb${element === scope ? " active" : ""}`, textContent: labelOf(element), title: "Use this as the AI scope" });
      button.addEventListener("click", () => setScope(element));
      crumbs.append(button);
    });
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  // ----- inline editing -----
  function startEdit(block) {
    editing = { el: block, html: block.innerHTML, text: textOf(block) };
    block.classList.remove("hre-hover", "hre-scope");
    block.classList.add("hre-editing");
    block.setAttribute("contenteditable", "plaintext-only");
    if (block.contentEditable !== "plaintext-only") block.setAttribute("contenteditable", "true");
    select(block);
    setStatus("", "Editing · Enter saves · Esc cancels");
    if (document.activeElement !== block) block.focus();
  }
  function endEdit() {
    const current = editing;
    editing = null;
    if (!current) return null;
    current.el.removeAttribute("contenteditable");
    current.el.classList.remove("hre-editing");
    return current;
  }
  function cancelEdit() {
    const current = endEdit();
    if (!current) return;
    current.el.innerHTML = current.html;
    current.el.blur();
    setStatus("", "Edit cancelled");
  }
  function commit() {
    const current = endEdit();
    if (!current) return saveQueue;
    const { el, html, text } = current;
    const next = innerOf(el);
    if (next === html) { setStatus("", "No changes"); return saveQueue; }
    setStatus("saving", "Saving…");
    saveQueue = saveQueue.then(async () => {
      try {
        const result = await request("/api/edit", { id: el.dataset.hre, version, text, html: next });
        version = result.version;
        updateHistory(result);
        if (result.html !== next) el.innerHTML = result.html;
        setStatus("saved", "Saved");
        if (result.reload) reload();
      } catch (error) {
        el.innerHTML = html;
        setStatus("error", "Not saved");
        toast(error.message);
        if (error.status === 409 || error.status === 404) setTimeout(reload, 1500);
      }
    });
    return saveQueue;
  }

  document.addEventListener("mouseover", (event) => {
    if (inUi(event.target)) return;
    const block = event.target.closest ? event.target.closest("[data-hre]") : null;
    const target = isBlock(block) ? block : null;
    if (target === hovered) return;
    if (hovered) hovered.classList.remove("hre-hover");
    hovered = target;
    if (hovered && hovered !== editing?.el) hovered.classList.add("hre-hover");
  });
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || inUi(event.target) || proposal || running) return;
    const node = event.target.closest ? event.target.closest("[data-hre]") : null;
    const target = isBlock(node) ? node : null;
    if (editing && editing.el !== target) commit();
    if (event.metaKey || event.ctrlKey || (target && editing?.el === target)) return;
    if (target) startEdit(target);
    else if (node) selectScope(node);
    else clearSelection();
  }, true);
  document.addEventListener("click", (event) => {
    if (inUi(event.target)) return;
    const link = event.target.closest ? event.target.closest("a[href]") : null;
    const block = event.target.closest ? event.target.closest("[data-hre]") : null;
    if (link && isBlock(block) && !(event.metaKey || event.ctrlKey)) event.preventDefault();
    if (editing && event.target.closest && event.target.closest("summary") === editing.el) event.preventDefault();
  }, true);
  document.addEventListener("focusout", (event) => {
    if (!editing || event.target !== editing.el || event.relatedTarget === host) return;
    commit();
  });
  document.addEventListener("paste", (event) => {
    if (!editing || !editing.el.contains(event.target)) return;
    event.preventDefault();
    const text = (event.clipboardData && event.clipboardData.getData("text/plain")) || "";
    document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "));
  }, true);
  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const origin = event.composedPath()[0];
    const typing = origin && (origin.tagName === "TEXTAREA" || origin.tagName === "INPUT" || origin.tagName === "SELECT");
    if (editing && event.target === editing.el) {
      if (event.key === "Enter" && !event.shiftKey && !mod) { event.preventDefault(); commit(); return; }
      if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); document.execCommand("insertLineBreak"); return; }
      if (event.key === "Escape") { event.preventDefault(); cancelEdit(); return; }
    }
    if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); openPanel(); return; }
    if (typing && inUi(event.target)) {
      if (mod && event.key === "Enter" && origin.id === "instruction") { event.preventDefault(); runAi($("instruction").value); }
      if (event.key === "Escape") closePanel();
      return;
    }
    if (!editing && mod && event.key.toLowerCase() === "z") { event.preventDefault(); historyStep(event.shiftKey ? "redo" : "undo"); return; }
    if (!editing && !mod && (event.key === "Delete" || event.key === "Backspace") && $("panel").hidden && scope && scope.classList.contains("hre-scope")) {
      event.preventDefault();
      removeScope();
      return;
    }
    if (!editing && event.key === "Escape") {
      if ($("panel").hidden) clearSelection();
      else closePanel();
    }
  }, true);

  // ----- AI rewrite -----
  async function openPanel() {
    if (!scope && hovered) select(hovered);
    if (!scope) { toast("Click a paragraph first, then widen the scope with the labels in the bar if needed."); return; }
    if (editing) await commit();
    setScope(scope);
    $("panel-title").textContent = `Rewrite ${labelOf(scope)}`;
    $("compose-meta").textContent = state ? `${state.settings.model} · ${state.settings.effort}` : "";
    show("panel", true); show("compose", true); show("result", false); show("busy", false); show("error", false);
    $("instruction").value = lastInstruction;
    $("instruction").focus();
  }
  function closePanel() {
    if (running) return;
    discardProposal();
    show("panel", false);
    if (scope) scope.classList.remove("hre-scope");
  }
  async function runAi(instruction) {
    const text = (instruction || "").trim();
    if (!text || !scope || running) return;
    lastInstruction = text;
    discardProposal();
    show("compose", false); show("result", false); show("error", false); show("busy", true);
    const controller = new AbortController();
    running = controller;
    const started = Date.now();
    const model = state ? state.settings.model : "the model";
    const tick = () => { $("busy-text").textContent = `Asking ${model}… ${Math.round((Date.now() - started) / 1000)} s`; };
    tick();
    const timer = setInterval(tick, 500);
    try {
      const result = await request("/api/ai", { id: scope.dataset.hre, version, instruction: text }, { signal: controller.signal });
      showProposal(result);
    } catch (error) {
      show("compose", true);
      if (error.name !== "AbortError") {
        $("error").textContent = error.message;
        show("error", true);
        if (error.status === 409) setTimeout(reload, 1500);
      }
    } finally {
      clearInterval(timer);
      running = null;
      show("busy", false);
    }
  }
  function showProposal(result) {
    const diff = $("diff");
    diff.textContent = "";
    for (const segment of result.diff) {
      const node = segment.op === "=" ? document.createElement("span") : document.createElement(segment.op === "+" ? "ins" : "del");
      node.textContent = `${segment.text} `;
      diff.append(node);
    }
    const seconds = (result.ms / 1000).toFixed(1);
    $("result-meta").textContent = `${result.provider} · ${result.model} · ${seconds} s${result.fallback ? ` · fell back to OpenRouter (${result.fallback})` : ""}${result.unchanged ? " · no changes suggested" : " · previewed in place"}`;
    const template = document.createElement("template");
    template.innerHTML = result.html;
    const preview = template.content.firstElementChild;
    if (preview && !result.unchanged) {
      preview.classList.add("hre-preview");
      scope.classList.remove("hre-scope");
      scope.replaceWith(preview);
    }
    proposal = { id: result.proposalId, original: scope, preview: result.unchanged ? null : preview };
    show("compose", false); show("result", true);
    $("accept").disabled = !!result.unchanged;
    $("accept").focus();
  }
  function discardProposal() {
    if (!proposal) return;
    if (proposal.preview && proposal.preview.isConnected) proposal.preview.replaceWith(proposal.original);
    proposal = null;
  }
  $("run").addEventListener("click", () => runAi($("instruction").value));
  $("cancel").addEventListener("click", () => running && running.abort());
  $("panel-close").addEventListener("click", closePanel);
  $("discard").addEventListener("click", () => { discardProposal(); show("result", false); show("compose", true); setScope(scope); });
  $("retry").addEventListener("click", () => runAi(lastInstruction));
  $("accept").addEventListener("click", async () => {
    if (!proposal) return;
    $("accept").disabled = true;
    try {
      const result = await request("/api/apply", { proposalId: proposal.id });
      version = result.version;
      reload();
    } catch (error) {
      $("error").textContent = error.message;
      show("error", true);
      if (error.status === 409) setTimeout(reload, 1500);
    }
  });
  for (const [label, instruction] of CHIPS) {
    const chip = Object.assign(document.createElement("button"), { className: "chip", textContent: label, title: instruction });
    chip.addEventListener("click", () => { $("instruction").value = instruction; runAi(instruction); });
    $("chips").append(chip);
  }
  $("ai").addEventListener("click", openPanel);

  // ----- delete -----
  async function removeScope() {
    const target = scope;
    if (!canDelete(target) || proposal || running) return;
    if (editing) {
      if (target.contains(editing.el)) cancelEdit();
      else await commit();
    }
    await saveQueue;
    target.classList.remove("hre-doomed");
    $("delete").disabled = true;
    setStatus("saving", "Deleting…");
    try {
      const result = await request("/api/delete", { id: target.dataset.hre, version });
      version = result.version;
      const links = result.unlinked ? ` and unlinked ${result.unlinked} reference${result.unlinked === 1 ? "" : "s"} to it` : "";
      sessionStorage.setItem(FLASH_KEY, `Deleted ${labelOf(target)}${links}. ⌘Z to undo.`);
      reload();
    } catch (error) {
      setStatus("error", "Not deleted");
      renderCrumbs();
      toast(error.message);
      if (error.status === 409 || error.status === 404) setTimeout(reload, 1500);
    }
  }
  const doom = (on) => { if (scope && canDelete(scope) && !$("delete").disabled) scope.classList.toggle("hre-doomed", on); };
  $("delete").addEventListener("mouseenter", () => doom(true));
  $("delete").addEventListener("mouseleave", () => doom(false));
  $("delete").addEventListener("focus", () => doom(true));
  $("delete").addEventListener("blur", () => doom(false));
  // Keep focus (and any edit in progress) where it is, so removeScope decides what to save.
  $("delete").addEventListener("mousedown", (event) => event.preventDefault());
  $("delete").addEventListener("click", removeScope);

  // ----- undo, redo, settings, live reload -----
  async function historyStep(kind) {
    if ($(kind).disabled) return;
    if (editing) await commit();
    try {
      await request(`/api/${kind}`, {});
      reload();
    } catch (error) {
      toast(error.message);
    }
  }
  $("undo").addEventListener("click", () => historyStep("undo"));
  $("redo").addEventListener("click", () => historyStep("redo"));

  const fillSelect = (select, values, current) => {
    select.textContent = "";
    for (const value of values) select.append(Object.assign(document.createElement("option"), { value, textContent: value, selected: value === current }));
  };
  const renderModelLabel = () => { if (state) $("model-label").textContent = `${state.settings.model} · ${state.settings.effort}`; };
  $("gear").addEventListener("click", () => {
    if (!state) return;
    fillSelect($("provider"), state.providers, state.settings.provider);
    fillSelect($("effort"), state.efforts, state.settings.effort);
    $("models").textContent = "";
    for (const model of state.models) $("models").append(Object.assign(document.createElement("option"), { value: model }));
    $("model").value = state.settings.model;
    show("settings", $("settings").hidden);
  });
  $("settings-cancel").addEventListener("click", () => show("settings", false));
  $("settings-save").addEventListener("click", async () => {
    try {
      const result = await request("/api/settings", { provider: $("provider").value, model: $("model").value, effort: $("effort").value }, { method: "PUT" });
      state.settings = result.settings;
      renderModelLabel();
      show("settings", false);
      toast(`AI: ${result.settings.provider} · ${result.settings.model} · ${result.settings.effort}`);
    } catch (error) {
      toast(error.message);
    }
  });
  $("banner-reload").addEventListener("click", reload);

  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash !== null) {
    sessionStorage.removeItem(FLASH_KEY);
    setStatus("saved", "Deleted");
    toast(flash);
  }

  request("/api/state", null, { method: "GET" }).then((data) => {
    state = data;
    renderModelLabel();
    updateHistory(data);
    if (data.version !== version) reload();
  }).catch((error) => toast(error.message));

  const events = new EventSource("/api/events");
  events.onmessage = (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    updateHistory(event);
    if (event.type !== "changed" && event.type !== "saved") return;
    setTimeout(() => {
      if (event.version === version || pending) return;
      if (editing || proposal || running) show("banner", true);
      else reload();
    }, event.type === "saved" ? 800 : 0);
  };
})();
