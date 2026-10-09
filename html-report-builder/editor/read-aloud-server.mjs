// Read aloud for the editor server, after t3code's ReadAloud.ts and ReadAloudRoute.ts. Each
// section's visible text is rewritten by the editor's AI provider into a spoken transcript,
// which Speechify voices with word timestamps. Transcripts, audio, and timings are cached on
// disk by content hash; audio streams to the page while it is being generated, then serves
// from the file with byte ranges.
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodeEntities } from "../scripts/lib/scan.mjs";
import { TRANSCRIPT_PROMPT_VERSION, buildTranscriptPrompt, resolveSecret } from "./providers.mjs";
import { DEFAULT_VOICE, SPEECHIFY_MODEL, SPOKEN_CHARS_PER_SECOND, SSML_VERSION, SpeechifyError, probe, splitTranscript, streamSpeech, transcriptToSsml } from "./speechify.mjs";

const MAX_TEXT = 60_000;
const KINDS = new Set(["hero", "section", "slide"]);
const AUDIO_NAME = /^([a-f0-9]{32})\.(mp3|timings\.json)$/;
const SETTLED = new Set(["ready", "missing-key", "invalid-key", "insufficient-credits"]);
const MISSING_KEY = "No Speechify API key. Set SPEECHIFY_API_KEY in your shell or in ~/.config/html-report-editor/.env, then press Check again.";

const hash32 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

class ReadAloudError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

function reportInfo(source) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source);
  const lang = /<html\b[^>]*\slang=["']?([\w-]+)/i.exec(source);
  return { title: title ? decodeEntities(title[1]).replace(/\s+/g, " ").trim() : "", lang: lang ? lang[1] : "" };
}

function touch(...files) {
  const now = new Date();
  for (const file of files) { try { utimesSync(file, now, now); } catch { /* pruned meanwhile */ } }
}

export function createReadAloud({
  session, transcribe, log = () => {}, cacheDir,
  cacheBytes = (Number(process.env.HRE_READ_ALOUD_CACHE_MB) || 512) * 1024 * 1024,
  apiKey, voice = process.env.SPEECHIFY_VOICE_ID || DEFAULT_VOICE,
  baseUrl = process.env.HRE_SPEECHIFY_BASE_URL || "https://api.speechify.ai",
  fetch: fetchImpl = globalThis.fetch, chunkChars = [6000, 10000]
}) {
  const abort = new AbortController();
  let statusValue = { state: "unknown" };
  let checking = null;
  let key = { value: "", source: null };
  const transcriptJobs = new Map();
  const audioJobs = new Map();
  const failures = new Map();
  const known = new Map();
  const file = (name) => path.join(cacheDir, name);
  const publicStatus = () => ({ ...statusValue, voice, model: SPEECHIFY_MODEL, keySource: key.source });

  /** Speechify's state, probed once (two characters) and cached until refreshed; "unavailable" is retried. */
  async function status({ refresh = false } = {}) {
    if (!refresh && SETTLED.has(statusValue.state)) return publicStatus();
    checking ??= (async () => {
      key = apiKey !== undefined ? { value: apiKey, source: apiKey ? "option" : null } : await resolveSecret("SPEECHIFY_API_KEY", { refresh });
      if (!key.value) { statusValue = { state: "missing-key", detail: MISSING_KEY }; return; }
      try {
        await probe({ apiKey: key.value, voice, baseUrl, fetch: fetchImpl, signal: abort.signal });
        statusValue = { state: "ready" };
      } catch (error) {
        statusValue = { state: error.kind || "unavailable", detail: error.detail || error.message };
      }
    })().finally(() => { checking = null; });
    await checking;
    return publicStatus();
  }

  function ensureTranscript(transcriptKey, prompt) {
    const cachedFile = file(`${transcriptKey}.script.json`);
    if (existsSync(cachedFile)) {
      try {
        const script = JSON.parse(readFileSync(cachedFile, "utf8"));
        if (typeof script.transcript === "string" && script.transcript) {
          touch(cachedFile);
          return Promise.resolve({ ...script, cached: true });
        }
      } catch { /* rewrite it */ }
    }
    if (transcriptJobs.has(transcriptKey)) return transcriptJobs.get(transcriptKey);
    // The server's own signal, not the request's: a finished script is always worth caching.
    const job = (async () => {
      const result = await transcribe(session.settings, { prompt, signal: abort.signal });
      const transcript = String(result?.transcript || "").trim();
      if (!transcript) throw new Error("the model returned an empty script");
      const script = { transcript, provider: result.provider || null, model: result.model || session.settings.model, ms: result.ms || 0, ...(result.fallback ? { fallback: result.fallback } : {}) };
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachedFile, JSON.stringify(script));
      return { ...script, cached: false };
    })().catch((error) => {
      throw new ReadAloudError(502, `Could not write the spoken script: ${error.message}`, { reason: "transcript-failed" });
    }).finally(() => transcriptJobs.delete(transcriptKey));
    transcriptJobs.set(transcriptKey, job);
    return job;
  }

  /** One synthesis per recording: pieces stream in order, their marks shifted onto one clock. */
  function startJob(audioKey, transcript) {
    mkdirSync(cacheDir, { recursive: true });
    failures.delete(audioKey);
    const partial = file(`${audioKey}.mp3.partial`);
    const job = { chunks: [], listeners: new Set(), failed: null };
    job.done = (async () => {
      const marks = [];
      let offset = 0;
      writeFileSync(partial, "");
      try {
        for (const piece of splitTranscript(transcript, chunkChars[1], chunkChars[0])) {
          let duration = null;
          let lastEnd = 0;
          for await (const packet of streamSpeech({ apiKey: key.value, voice, input: transcriptToSsml(piece), baseUrl, fetch: fetchImpl, signal: abort.signal })) {
            if (packet.audio?.length) {
              appendFileSync(partial, packet.audio);
              job.chunks.push(packet.audio);
              for (const listener of job.listeners) listener.write(packet.audio);
            }
            for (const mark of packet.marks || []) {
              marks.push({ text: mark.text, start: mark.start + offset, end: mark.end + offset });
              lastEnd = Math.max(lastEnd, mark.end);
            }
            if (packet.duration != null) duration = packet.duration;
          }
          offset += duration ?? lastEnd;
        }
        writeFileSync(file(`${audioKey}.timings.json`), JSON.stringify(marks));
        renameSync(partial, file(`${audioKey}.mp3`));
        if (statusValue.state !== "ready") statusValue = { state: "ready" };
      } catch (error) {
        rmSync(partial, { force: true });
        job.failed = error;
        if (error instanceof SpeechifyError && error.kind !== "unavailable") statusValue = { state: error.kind, detail: error.detail };
        failures.set(audioKey, { error: error.message, state: error.kind || "unavailable", detail: error.detail || error.message });
        throw error;
      } finally {
        audioJobs.delete(audioKey);
        for (const listener of job.listeners) (job.failed ? listener.destroy() : listener.end());
        job.listeners.clear();
      }
      prune();
    })();
    job.done.catch((error) => { if (!abort.signal.aborted) log(`Read aloud: Speechify failed (${error.message})`); });
    audioJobs.set(audioKey, job);
    return job;
  }

  /** Oldest first until the cache fits; in-progress partial files are never pruned. */
  function prune() {
    let entries;
    try {
      entries = readdirSync(cacheDir).filter((name) => /\.(mp3|timings\.json|script\.json)$/.test(name)).map((name) => {
        const stat = statSync(file(name));
        return { name, size: stat.size, mtime: stat.mtimeMs };
      });
    } catch { return; }
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.mtime - b.mtime)) {
      if (total <= cacheBytes) break;
      rmSync(file(entry.name), { force: true });
      total -= entry.size;
    }
  }

  async function prepare(body = {}) {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new ReadAloudError(400, "This section has nothing to read.");
    if (text.length > MAX_TEXT) throw new ReadAloudError(413, "This section is too long to read aloud; split it into smaller sections.");
    const kind = KINDS.has(body.kind) ? body.kind : "section";
    const current = await status();
    if (current.state !== "ready") throw new ReadAloudError(503, current.detail || "Speechify is not ready.", { reason: "not-ready", state: current.state, detail: current.detail || "" });
    const { title, lang } = reportInfo(session.source);
    const prompt = buildTranscriptPrompt({ title, lang, kind, label: String(body.label || "").slice(0, 200), index: Number(body.index) || 1, total: Number(body.total) || 1, text });
    const script = await ensureTranscript(hash32({ v: 1, version: TRANSCRIPT_PROMPT_VERSION, model: session.settings.model, prompt }), prompt);
    const transcript = script.transcript;
    const audioKey = hash32({ v: 1, transcript, voice, model: SPEECHIFY_MODEL, ssml: SSML_VERSION });
    known.set(audioKey, transcript);
    const mp3 = file(`${audioKey}.mp3`);
    const cached = !audioJobs.has(audioKey) && existsSync(mp3);
    if (cached) touch(mp3, file(`${audioKey}.timings.json`));
    else if (body.synthesize !== false && !audioJobs.has(audioKey)) startJob(audioKey, transcript);
    return {
      audioKey, audioUrl: `/api/read-aloud/audio/${audioKey}.mp3`, timingsUrl: `/api/read-aloud/audio/${audioKey}.timings.json`,
      cached, transcript, estimatedSeconds: Math.round((transcript.length / SPOKEN_CHARS_PER_SECOND) * 10) / 10, voice,
      script: { provider: script.provider, model: script.model, ms: script.ms, cached: script.cached, ...(script.fallback ? { fallback: script.fallback } : {}) }
    };
  }

  function serveLive(res, job) {
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" });
    for (const chunk of job.chunks) res.write(chunk);
    job.listeners.add(res);
    res.on("close", () => job.listeners.delete(res));
  }

  function serveFile(req, res, mp3) {
    const size = statSync(mp3).size;
    const headers = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      createReadStream(mp3, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(mp3).pipe(res);
  }

  /** GET /api/read-aloud/audio/<key>.mp3 or .timings.json (behind the editor's cookie check). */
  async function serveAudio(req, res, name) {
    const match = AUDIO_NAME.exec(name || "");
    if (!match) return sendJson(res, 404, { ok: false, error: "Not found." });
    const [, audioKey, ext] = match;
    const job = audioJobs.get(audioKey);
    const failed = () => sendJson(res, 502, { ok: false, reason: "speech-failed", ...failures.get(audioKey) });
    if (!job && failures.has(audioKey)) return failed();
    if (ext === "timings.json") {
      if (job) {
        try { await job.done; } catch { return failed(); }
      }
      const timings = file(`${audioKey}.timings.json`);
      if (!existsSync(timings)) return sendJson(res, 404, { ok: false, error: "Not found." });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(readFileSync(timings));
    }
    if (job) return serveLive(res, job);
    const mp3 = file(`${audioKey}.mp3`);
    if (existsSync(mp3)) return serveFile(req, res, mp3);
    if (known.has(audioKey) && statusValue.state === "ready") return serveLive(res, startJob(audioKey, known.get(audioKey)));
    return sendJson(res, 404, { ok: false, error: "Not found." });
  }

  function close() {
    abort.abort();
    for (const job of audioJobs.values()) for (const listener of job.listeners) listener.destroy();
  }

  return { status, prepare, serveAudio, close };
}
