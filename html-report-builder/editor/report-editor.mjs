#!/usr/bin/env node
// Local point-and-click editor for one HTML report, with AI rewrites of a paragraph or section,
// deletion of sections, cards, rows, and paragraphs, and review comments pinned to any part.
// Usage: report-editor.mjs <file.html> [--port 0] [--provider codex|openrouter] [--model gpt-6-luna]
//                          [--effort low] [--author "Name"] [--no-open]
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshToc } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";
import { addThread, deleteThread, keepPins, publicThreads, replyToThread, setThreadStatus } from "../scripts/lib/comments.mjs";
import { loadRuntime } from "../scripts/lib/runtime.mjs";
import { attr, normalizeText, parse, splice, textContent } from "../scripts/lib/scan.mjs";
import { describe, instrument, locate, outlineHeadings, removal, replaceInner, replaceOuter, surroundingText } from "./blocks.mjs";
import { DEFAULT_SETTINGS, EFFORTS, MODEL_SUGGESTIONS, PROVIDERS, buildPrompt, rewrite as defaultRewrite } from "./providers.mjs";
import { ALLOWED_FRAGMENT_TAGS, protect, readableText, restore, sanitizeInline, validateRewrite, wordDiff } from "./sanitize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "html-report-editor");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const BACKUP_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "html-report-editor");
const ASSET_TYPES = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm"
};
const MAX_BODY = 4 * 1024 * 1024;

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const minuteStamp = () => `${new Date().toISOString().slice(0, 16)}Z`;

/** Who comments are from: --author, then git's user.name, then the login name. */
export function defaultAuthor() {
  try {
    const name = execFileSync("git", ["config", "user.name"], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (name) return name;
  } catch { /* no git or no name */ }
  try { return os.userInfo().username; } catch { return "Reviewer"; }
}

export function isEntrypoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(moduleUrl) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

export function loadSettings(configFile = CONFIG_FILE) {
  try {
    const saved = JSON.parse(readFileSync(configFile, "utf8"));
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeSettings(input, base = DEFAULT_SETTINGS) {
  const settings = { ...base };
  if (PROVIDERS.includes(input.provider)) settings.provider = input.provider;
  if (typeof input.model === "string" && /^[\w./:-]{1,80}$/.test(input.model.trim())) settings.model = input.model.trim();
  if (EFFORTS.includes(input.effort)) settings.effort = input.effort;
  return settings;
}

// Check errors a change introduces. List-style errors ("duplicate ids: a, b") are compared
// item by item, so fixing or keeping an old problem never counts against the change.
function addedErrors(before, after, file) {
  const items = (source) => new Set(checkSource(source, { file }).errors.flatMap((error) => {
    const match = /^([^:]+): (.+)$/.exec(error);
    return match ? match[2].split(", ").filter((item) => !/^\+\d+ more$/.test(item)).map((item) => `${match[1]}: ${item}`) : [error];
  }));
  const known = items(before);
  return [...items(after)].filter((error) => !known.has(error));
}

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Start the editor server. Returns {url, port, close, session}. */
export async function startEditor({
  file, port = 0, settings, configFile = CONFIG_FILE, backupDir = BACKUP_DIR, rewrite = defaultRewrite, pollMs = 1000, log = console.log,
  author = defaultAuthor()
}) {
  const target = realpathSync(path.resolve(file));
  if (!statSync(target).isFile()) throw new Error(`not a file: ${file}`);
  const baseDir = path.dirname(target);
  const token = randomBytes(24).toString("base64url");
  const session = {
    file: target,
    source: readFileSync(target, "utf8"),
    settings: settings ? normalizeSettings(settings) : loadSettings(configFile),
    undo: [],
    redo: [],
    proposals: new Map(),
    clients: new Set(),
    backedUp: false,
    author: String(author || "Reviewer").trim().slice(0, 80) || "Reviewer"
  };
  session.version = hash(session.source);
  let stat = statSync(target);
  let cookieName = "hre";

  const broadcast = (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of session.clients) client.write(data);
  };

  const write = (next, { undoable = true } = {}) => {
    if (!session.backedUp) {
      mkdirSync(backupDir, { recursive: true });
      const backup = path.join(backupDir, `${path.basename(target, ".html")}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
      copyFileSync(target, backup);
      session.backedUp = backup;
      log(`Backup of the original: ${backup}`);
    }
    const temporary = `${target}.hre-${process.pid}-${Date.now()}.tmp`;
    writeFileSync(temporary, next, { mode: stat.mode });
    renameSync(temporary, target);
    stat = statSync(target);
    if (undoable) {
      session.undo.push({ before: session.source, after: next });
      if (session.undo.length > 100) session.undo.shift();
      session.redo = [];
    }
    session.source = next;
    session.version = hash(next);
    session.proposals.clear();
    broadcast({ type: "saved", version: session.version, canUndo: session.undo.length > 0, canRedo: session.redo.length > 0 });
  };

  const poll = setInterval(() => {
    try {
      const current = statSync(target);
      if (current.mtimeMs === stat.mtimeMs && current.size === stat.size) return;
      stat = current;
      const source = readFileSync(target, "utf8");
      const version = hash(source);
      if (version === session.version) return;
      session.source = source;
      session.version = version;
      session.undo = [];
      session.redo = [];
      session.proposals.clear();
      broadcast({ type: "changed", version, canUndo: false, canRedo: false });
    } catch { /* the file may be mid-replace; try again next tick */ }
  }, pollMs);
  poll.unref?.();

  const requireVersion = (version) => {
    if (version !== session.version) throw new HttpError(409, "The report changed since this page loaded. Reloading.", { version: session.version });
  };

  const api = {
    state() {
      const doc = parse(session.source);
      const html = doc.elements.find((e) => e.name === "html");
      return {
        file: target, name: path.basename(target), version: session.version, settings: session.settings,
        providers: PROVIDERS, efforts: EFFORTS, models: MODEL_SUGGESTIONS,
        audience: (html && attr(html, "data-audience")) || "internal",
        canUndo: session.undo.length > 0, canRedo: session.redo.length > 0,
        author: session.author, comments: publicThreads(session.source)
      };
    },
    edit({ id, version, text, html }) {
      requireVersion(version);
      const found = locate(session.source, String(id));
      if (!found || found.kind !== "block") throw new HttpError(404, "That block no longer exists. Reloading.");
      const element = found.element;
      if (normalizeText(textContent(found.doc, element)) !== normalizeText(String(text ?? ""))) {
        throw new HttpError(409, "The page and the file disagree about this block, so nothing was saved. Reloading.", { version: session.version });
      }
      const original = session.source.slice(element.innerStart, element.innerEnd);
      const clean = sanitizeInline(String(html ?? ""), original);
      if (clean === original) return { version: session.version, html: clean, unchanged: true };
      let next = replaceInner(session.source, element, clean);
      let reload = false;
      if (/^h[1-6]$/.test(element.name)) {
        const refreshed = refreshToc(next);
        reload = refreshed !== next;
        next = refreshed;
      }
      write(next);
      return { version: session.version, html: clean, reload, canUndo: true, canRedo: false };
    },
    async ai({ id, version, instruction }, signal) {
      requireVersion(version);
      const text = String(instruction || "").trim();
      if (!text) throw new HttpError(400, "Write an instruction first.");
      if (text.length > 4000) throw new HttpError(400, "The instruction is too long.");
      const found = locate(session.source, String(id));
      if (!found) throw new HttpError(404, "That part of the report no longer exists. Reloading.");
      const { doc, element } = found;
      const source = session.source;
      const outer = source.slice(element.start, element.end);
      const { html: fragment, kept } = protect(outer);
      const htmlElement = doc.elements.find((e) => e.name === "html");
      const title = doc.elements.find((e) => e.name === "title");
      const context = surroundingText(doc, element);
      const prompt = buildPrompt({
        fragment, instruction: text,
        title: title ? normalizeText(textContent(doc, title)) : "",
        audience: (htmlElement && attr(htmlElement, "data-audience")) || "internal",
        outline: outlineHeadings(doc), before: context.before, after: context.after,
        vocabulary: [...loadRuntime(htmlElement && attr(htmlElement, "data-template")).classes].filter((c) => !c.startsWith("hr-")).sort(),
        tags: ALLOWED_FRAGMENT_TAGS
      });
      const result = await rewrite(session.settings, { prompt, signal });
      let restored;
      try {
        restored = keepPins(outer, restore(validateRewrite(result.html, fragment), kept));
      } catch (error) {
        throw new HttpError(422, `The AI proposal was rejected: ${error.message}. Try again or rephrase.`, { provider: result.provider, model: result.model });
      }
      if (session.version !== version) throw new HttpError(409, "The report changed while the AI was working. Reloading.", { version: session.version });
      const next = refreshToc(replaceOuter(source, element, restored));
      const added = addedErrors(source, next, target);
      if (added.length) throw new HttpError(422, `The AI proposal would break the report (${added.join("; ")}). Try again or rephrase.`);

      const proposalId = randomBytes(8).toString("hex");
      session.proposals.set(proposalId, { version, next });
      return {
        proposalId, html: restored, diff: wordDiff(readableText(outer), readableText(restored)),
        provider: result.provider, model: result.model, ms: result.ms, fallback: result.fallback || null,
        unchanged: restored === outer
      };
    },
    remove({ id, version }) {
      requireVersion(version);
      const found = locate(session.source, String(id));
      if (!found) throw new HttpError(404, "That part of the report no longer exists. Reloading.");
      if (!found.deletable) throw new HttpError(400, "This part of the report cannot be deleted on its own. Select its section, card, row, or list instead.");
      const { edits, unlinked } = removal(found.doc, found.element);
      const next = refreshToc(splice(session.source, edits));
      const added = addedErrors(session.source, next, target);
      if (added.length) throw new HttpError(422, `Deleting this would break the report (${added.join("; ")}).`);
      write(next);
      return { version: session.version, reload: true, unlinked, canUndo: true, canRedo: false };
    },
    apply({ proposalId }) {
      const proposal = session.proposals.get(String(proposalId));
      if (!proposal) throw new HttpError(409, "That proposal expired because the report changed. Reloading.");
      requireVersion(proposal.version);
      write(proposal.next);
      return { version: session.version, reload: true };
    },
    undo() {
      const entry = session.undo.at(-1);
      if (!entry || hash(entry.after) !== session.version) {
        session.undo = [];
        throw new HttpError(409, "Nothing to undo.");
      }
      session.undo.pop();
      session.redo.push(entry);
      write(entry.before, { undoable: false });
      return { version: session.version, reload: true };
    },
    redo() {
      const entry = session.redo.at(-1);
      if (!entry || hash(entry.before) !== session.version) {
        session.redo = [];
        throw new HttpError(409, "Nothing to redo.");
      }
      session.redo.pop();
      session.undo.push(entry);
      write(entry.after, { undoable: false });
      return { version: session.version, reload: true };
    },
    saveSettings(input) {
      session.settings = normalizeSettings(input, session.settings);
      mkdirSync(path.dirname(configFile), { recursive: true });
      writeFileSync(configFile, `${JSON.stringify(session.settings, null, 2)}\n`);
      return { settings: session.settings };
    },
    describe({ id }) {
      const found = locate(session.source, String(id));
      if (!found) throw new HttpError(404, "Not found.");
      return describe(found, found.doc);
    },
    comment({ id, version, x, y, text }) {
      requireVersion(version);
      const found = locate(session.source, String(id));
      if (!found) throw new HttpError(404, "That part of the report no longer exists. Reloading.");
      const added = commentWrite(() => addThread(session.source, found.doc, found.element, { x, y, text, by: session.author, at: minuteStamp(), kind: found.kind }));
      return { ...commentResult(), thread: added.id };
    },
    reply({ thread, version, text }) {
      requireVersion(version);
      commentWrite(() => ({ source: replyToThread(session.source, String(thread), { text, by: session.author, at: minuteStamp() }) }));
      return commentResult();
    },
    resolve({ thread, version, resolved }) {
      requireVersion(version);
      commentWrite(() => ({ source: setThreadStatus(session.source, String(thread), resolved === false ? "open" : "resolved") }));
      return commentResult();
    },
    uncomment({ thread, version }) {
      requireVersion(version);
      commentWrite(() => ({ source: deleteThread(session.source, String(thread)) }));
      return commentResult();
    }
  };
  function commentWrite(change) {
    let result;
    try {
      result = change();
    } catch (error) {
      throw new HttpError(/no longer exists/.test(error.message) ? 404 : 400, error.message);
    }
    if (result.source !== session.source) write(result.source);
    return result;
  }
  function commentResult() {
    return { version: session.version, comments: publicThreads(session.source), canUndo: session.undo.length > 0, canRedo: session.redo.length > 0 };
  }

  const servePage = () => {
    const state = JSON.stringify({ version: session.version }).replace(/</g, "\\u003c");
    return instrument(session.source, {
      headHtml: `<link rel="stylesheet" href="/__hre/overlay.css" data-hr-ui><script type="application/json" id="hre-state" data-hr-ui>${state}</script>\n`,
      bodyHtml: `<script src="/__hre/overlay.js" data-hr-ui></script>\n`
    });
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Request too large.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(new HttpError(400, "Invalid JSON.")); }
    });
    req.on("error", reject);
  });

  const send = (res, status, body, type = "application/json; charset=utf-8", headers = {}) => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers });
    res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const address = server.address();
      const allowedHosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
      if (!allowedHosts.includes(req.headers.host)) return send(res, 403, { error: "Forbidden host." });
      const url = new URL(req.url, `http://${req.headers.host}`);
      const cookies = Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), c.slice(i + 1)]; }));
      if (req.method === "GET" && url.pathname === "/" && url.searchParams.get("t") === token) {
        return send(res, 302, "", "text/plain", { Location: "/", "Set-Cookie": `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/` });
      }
      if (cookies[cookieName] !== token) return send(res, 403, "Open the editor with the link printed in the terminal.", "text/plain; charset=utf-8");
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        if (!origin || !allowedHosts.map((h) => `http://${h}`).includes(origin)) return send(res, 403, { error: "Forbidden origin." });
        if (!(req.headers["content-type"] || "").startsWith("application/json")) return send(res, 415, { error: "JSON required." });
      }
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, servePage(), "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname.startsWith("/__hre/")) {
        const name = url.pathname.slice("/__hre/".length);
        if (!["overlay.js", "overlay.css", "toolbar.css"].includes(name)) return send(res, 404, { error: "Not found." });
        return send(res, 200, readFileSync(path.join(HERE, name)), ASSET_TYPES[path.extname(name)]);
      }
      if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, api.state());
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write(`data: ${JSON.stringify({ type: "hello", version: session.version })}\n\n`);
        session.clients.add(res);
        const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
        req.on("close", () => { clearInterval(keepAlive); session.clients.delete(res); });
        return undefined;
      }
      const routes = {
        "/api/edit": "edit", "/api/ai": "ai", "/api/apply": "apply", "/api/delete": "remove", "/api/undo": "undo", "/api/redo": "redo", "/api/settings": "saveSettings", "/api/describe": "describe",
        "/api/comments/add": "comment", "/api/comments/reply": "reply", "/api/comments/resolve": "resolve", "/api/comments/delete": "uncomment"
      };
      if ((req.method === "POST" || req.method === "PUT") && routes[url.pathname]) {
        const body = await readBody(req);
        const controller = new AbortController();
        res.on("close", () => { if (!res.writableEnded) controller.abort(); });
        const result = await api[routes[url.pathname]](body, controller.signal);
        return send(res, 200, { ok: true, ...result });
      }
      if (req.method === "GET") {
        const relative = decodeURIComponent(url.pathname);
        const asset = path.resolve(baseDir, `.${relative}`);
        const type = ASSET_TYPES[path.extname(asset).toLowerCase()];
        if (type && asset.startsWith(baseDir + path.sep) && !relative.split("/").some((part) => part.startsWith(".")) && existsSync(asset) && statSync(asset).isFile()) {
          return send(res, 200, readFileSync(asset), type);
        }
      }
      return send(res, 404, { error: "Not found." });
    } catch (error) {
      if (res.headersSent) { res.end(); return undefined; }
      const status = error.status || (error.message === "cancelled" ? 499 : 500);
      return send(res, status, { ok: false, error: error.message, ...(error.extra || {}) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const actualPort = server.address().port;
  cookieName = `hre_${actualPort}`;
  const url = `http://127.0.0.1:${actualPort}/?t=${token}`;
  return {
    url, port: actualPort, session,
    close: () => new Promise((resolve) => {
      clearInterval(poll);
      for (const client of session.clients) client.end();
      server.close(() => resolve());
      server.closeAllConnections?.();
    })
  };
}

function parseArgs(argv) {
  const options = { open: true, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === "--port") options.port = Number(value());
    else if (arg === "--provider") options.overrides.provider = value();
    else if (arg === "--model") options.overrides.model = value();
    else if (arg === "--effort") options.overrides.effort = value();
    else if (arg === "--author") options.author = value();
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!options.file) options.file = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.file) {
    console.log("Usage: report-editor.mjs <file.html> [--port 0] [--provider codex|openrouter] [--model gpt-6-luna] [--effort low] [--author \"Name\"] [--no-open]");
    process.exitCode = options.help ? 0 : 2;
    return;
  }
  const settings = { ...loadSettings(), ...options.overrides };
  const editor = await startEditor({ file: options.file, port: options.port || 0, settings, ...(options.author ? { author: options.author } : {}) });
  const { provider, model, effort } = editor.session.settings;
  console.log(`Editing ${editor.session.file}\nOpen: ${editor.url}\nAI: ${provider} / ${model} (effort ${effort})\nPress Ctrl+C to stop.`);
  if (options.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    spawn(opener, [editor.url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
  const stop = async () => { await editor.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
