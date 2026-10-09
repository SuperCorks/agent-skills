import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { startEditor } from "../editor/report-editor.mjs";
import { SpeechifyError, parseSse, probe, speechifyFailureKind, splitTranscript, streamSpeech, transcriptToSsml } from "../editor/speechify.mjs";
import { buildSource } from "../scripts/lib/build.mjs";
import { startFakeSpeechify } from "./fixtures/fake-speechify.mjs";

process.env.HRE_NO_LOGIN_SHELL = "1";

const bytes = (text) => (async function* () { for (const byte of Buffer.from(text)) yield new Uint8Array([byte]); })();
const sseResponse = (text, status = 200) => new Response(new ReadableStream({ start(controller) { for (const byte of Buffer.from(text)) controller.enqueue(new Uint8Array([byte])); controller.close(); } }), { status });

test("server-sent events parse across single-byte chunks and CRLF line ends", async () => {
  const events = [];
  for await (const event of parseSse(bytes("event: speech.chunk\r\ndata: {\"a\":1}\r\n\r\n: comment\nevent: speech.done\ndata: one\ndata: two\n\n"))) events.push(event);
  assert.deepEqual(events, [{ event: "speech.chunk", data: "{\"a\":1}" }, { event: "speech.done", data: "one\ntwo" }]);
});

test("streamSpeech yields audio and word marks, and fails as unavailable on broken streams", async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    return sseResponse(`event: speech.chunk\ndata: ${JSON.stringify({ audio: Buffer.from("abc").toString("base64") })}\n\nevent: speech.chunk\ndata: ${JSON.stringify({ speech_marks: [{ type: "sentence", value: "x", start_time: 0, end_time: 9 }, { type: "word", value: "Hi.", start_time: 100, end_time: 400 }] })}\n\nevent: speech.done\ndata: {"audio_duration_ms": 500}\n\n`);
  };
  const packets = [];
  for await (const packet of streamSpeech({ apiKey: "k", input: "<speak>Hi.</speak>", baseUrl: "https://x", fetch })) packets.push(packet);
  assert.equal(packets[0].audio.toString(), "abc");
  assert.deepEqual(packets[1].marks, [{ text: "Hi.", start: 0.1, end: 0.4 }]);
  assert.deepEqual(packets[2], { duration: 0.5 });
  assert.equal(requests[0].url, "https://x/v1/audio/stream/with-timestamps");
  assert.equal(requests[0].init.headers.Authorization, "Bearer k");
  assert.equal(requests[0].init.headers.Accept, "text/event-stream");
  assert.deepEqual(JSON.parse(requests[0].init.body), { input: "<speak>Hi.</speak>", voice_id: "harper_32", model: "simba-3.2", language: "en-US", output_format: "mp3_24000_64" });

  const drain = async (response) => { for await (const _ of streamSpeech({ apiKey: "k", input: "x", fetch: async () => response })) { /* drain */ } };
  await assert.rejects(drain(sseResponse("event: speech.error\ndata: {}\n\n")), (error) => error instanceof SpeechifyError && error.kind === "unavailable");
  await assert.rejects(drain(sseResponse("event: speech.chunk\ndata: {}\n\n")), (error) => error.kind === "unavailable", "a stream without speech.done failed");
  await assert.rejects(drain(new Response(JSON.stringify({ error: { message: "Spend cap reached until Friday." } }), { status: 402 })), (error) => error.kind === "insufficient-credits" && error.detail === "Spend cap reached until Friday.");
  await assert.rejects(probe({ apiKey: "k", fetch: async () => { throw new TypeError("fetch failed"); } }), (error) => error.kind === "unavailable");
  assert.deepEqual([401, 403, 402, 429, 500].map(speechifyFailureKind), ["invalid-key", "invalid-key", "insufficient-credits", "unavailable", "unavailable"]);
});

test("transcripts become SSML with pauses and split on natural boundaries", () => {
  assert.equal(transcriptToSsml("A & B < C.\n\nNext.\nLine."), '<speak>A &amp; B &lt; C.<break strength="weak" />Next.<break time="250ms" />Line.</speak>');
  const text = "First paragraph sentence one. Sentence two.\n\nSecond paragraph is here. And more words follow it.";
  const pieces = splitTranscript(text, 60, 30);
  assert.deepEqual(pieces, ["First paragraph sentence one. Sentence two.", "Second paragraph is here. And more words follow it."]);
  assert.ok(splitTranscript("word ".repeat(100), 50).every((piece) => piece.length <= 50));
});

// ----- the API, against a fake Speechify -----
const REPORT = buildSource(`<!doctype html>
<html lang="en" data-template="findings">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Read aloud test</title></head>
<body>
<header class="hero"><h1>Read aloud test</h1></header>
<main><section id="summary"><h2>At a glance</h2><p>Sync fails four nights a month.</p></section></main>
</body>
</html>
`).output;
let dir;
let fake;
let editor;
let cookie;
const transcribes = [];
const spoken = (prompt) => `Spoken: ${prompt.split("<content>\n")[1].split("\n</content>")[0].replace(/^#+\s*/gm, "")}`;

async function open(readAloud) {
  const instance = await startEditor({
    file: path.join(dir, "report.html"), port: 0, settings: { provider: "codex", model: "gpt-6-luna", effort: "low" },
    configFile: path.join(dir, "config.json"), backupDir: path.join(dir, `backup-${Math.random().toString(36).slice(2)}`), pollMs: 60_000, log: () => {},
    transcribe: async (settings, { prompt }) => { transcribes.push(prompt); return { transcript: spoken(prompt), provider: "mock", model: settings.model, ms: 3 }; },
    readAloud
  });
  const login = await fetch(instance.url, { redirect: "manual" });
  instance.cookie = login.headers.get("set-cookie").split(";")[0];
  return instance;
}
const call = (instance, pathname, { method = "POST", body, headers = {} } = {}) => fetch(`http://127.0.0.1:${instance.port}${pathname}`, {
  method, headers: { Cookie: instance.cookie, Origin: `http://127.0.0.1:${instance.port}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined
});
const json = async (response) => ({ status: response.status, body: await response.json() });

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hre-read-aloud-"));
  writeFileSync(path.join(dir, "report.html"), REPORT);
  fake = await startFakeSpeechify();
  editor = await open({ apiKey: "test-key", baseUrl: fake.url, chunkChars: [40, 80] });
  cookie = editor.cookie;
});
after(async () => { await editor?.close(); await fake?.close(); });

test("status probes once, caches the answer, and probes again on request", async () => {
  const first = await json(await call(editor, "/api/read-aloud/status", { body: {} }));
  assert.deepEqual([first.status, first.body.state, first.body.voice, first.body.model], [200, "ready", "harper_32", "simba-3.2"]);
  await call(editor, "/api/read-aloud/status", { body: {} });
  assert.equal(fake.probes, 1);
  await call(editor, "/api/read-aloud/status", { body: { refresh: true } });
  assert.equal(fake.probes, 2);
});

test("prepare writes the script once, streams audio live, then serves exact byte ranges and shifted timings", async () => {
  fake.delayMs = 150;
  const text = "# At a glance\nSync fails four nights a month. The queue retries each failure twice before it alerts the team on call.";
  const body = { key: "summary", kind: "section", label: "At a glance", index: 2, total: 3, text };
  const prepared = await json(await call(editor, "/api/read-aloud/prepare", { body }));
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const { audioUrl, timingsUrl, transcript, cached, script } = prepared.body;
  assert.match(audioUrl, /^\/api\/read-aloud\/audio\/[a-f0-9]{32}\.mp3$/);
  assert.equal(cached, false);
  assert.equal(script.model, "gpt-6-luna");
  assert.match(transcribes.at(-1), /This part: a report section "At a glance" \(part 2 of 3\)/);
  assert.match(transcribes.at(-1), /Report title: Read aloud test/);
  assert.match(transcribes.at(-1), /hre-speech-transcript|Rewrite one part of a report/);

  const live = await call(editor, audioUrl, { method: "GET" });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("content-length"), null, "a recording in progress streams without a length");
  const audio = Buffer.from(await live.arrayBuffer()).toString();
  const words = transcript.split(/\s+/);
  assert.ok(audio.startsWith(`[${words[0]}`), audio);
  const timings = await (await call(editor, timingsUrl, { method: "GET" })).json();
  assert.equal(timings.length, words.length);
  assert.deepEqual(timings.map((t) => t.text), words, "every word is marked, across all pieces");
  assert.ok(timings.every((t, i) => i === 0 || t.start > timings[i - 1].start), "pieces are shifted onto one clock");
  assert.ok(fake.requests.filter((r) => r.path.endsWith("with-timestamps")).length > 1, "a long transcript is split into pieces");

  const again = await json(await call(editor, "/api/read-aloud/prepare", { body }));
  assert.equal(again.body.cached, true);
  assert.equal(again.body.script.cached, true);
  assert.equal(transcribes.length, 1, "the script is cached");
  const ranged = await call(editor, audioUrl, { method: "GET", headers: { Range: "bytes=2-5" } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), `bytes 2-5/${Buffer.byteLength(audio)}`);
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), audio.slice(2, 6));
  assert.equal((await call(editor, audioUrl, { method: "GET", headers: { Range: "bytes=999999-" } })).status, 416);
  fake.delayMs = 0;
});

test("prefetching a script does not buy audio, and bad requests are refused", async () => {
  const before = fake.requests.length;
  const prepared = await json(await call(editor, "/api/read-aloud/prepare", { body: { key: "next", kind: "slide", label: "Next", text: "Slide text.\n\nSpeaker notes:\nSay hello.", synthesize: false } }));
  assert.equal(prepared.status, 200);
  assert.equal(fake.requests.length, before, "no Speechify call");
  assert.match(transcribes.at(-1), /a slide with its speaker notes "Next"/);
  assert.equal((await call(editor, "/api/read-aloud/prepare", { body: { text: "  " } })).status, 400);
  assert.equal((await call(editor, "/api/read-aloud/prepare", { body: { text: "x".repeat(60_001) } })).status, 413);
  assert.equal((await call(editor, "/api/read-aloud/audio/../../etc.mp3", { method: "GET" })).status, 404);
  assert.equal((await call(editor, `/api/read-aloud/audio/${"0".repeat(32)}.mp3`, { method: "GET" })).status, 404);
  const anonymous = await fetch(`http://127.0.0.1:${editor.port}${prepared.body.audioUrl}`);
  assert.equal(anonymous.status, 403, "audio needs the session cookie");
});

test("a missing key, a rejected key, and running out of credits say why and play nothing", async () => {
  const missing = await open({ apiKey: "", baseUrl: fake.url });
  try {
    const status = await json(await call(missing, "/api/read-aloud/status", { body: {} }));
    assert.equal(status.body.state, "missing-key");
    const prepared = await json(await call(missing, "/api/read-aloud/prepare", { body: { text: "Hello there." } }));
    assert.deepEqual([prepared.status, prepared.body.state], [503, "missing-key"]);
    assert.match(prepared.body.error, /SPEECHIFY_API_KEY/);
  } finally { await missing.close(); }

  const rejected = await open({ apiKey: "wrong-key", baseUrl: fake.url });
  try {
    assert.equal((await json(await call(rejected, "/api/read-aloud/status", { body: {} }))).body.state, "invalid-key");
  } finally { await rejected.close(); }

  const poor = await open({ apiKey: "test-key", baseUrl: fake.url, cacheBytes: 1 });
  try {
    const ok = await json(await call(poor, "/api/read-aloud/prepare", { body: { text: "A short section to read." } }));
    await (await call(poor, ok.body.audioUrl, { method: "GET" })).arrayBuffer();
    fake.streamMode = 402;
    const broke = await json(await call(poor, "/api/read-aloud/prepare", { body: { text: "Another section that will fail." } }));
    const audio = await call(poor, broke.body.audioUrl, { method: "GET" }).catch((error) => error);
    if (audio.arrayBuffer) await audio.arrayBuffer().catch(() => {});
    const timings = await json(await call(poor, broke.body.timingsUrl, { method: "GET" }));
    assert.deepEqual([timings.status, timings.body.reason, timings.body.state], [502, "speech-failed", "insufficient-credits"]);
    const status = await json(await call(poor, "/api/read-aloud/status", { body: {} }));
    assert.deepEqual([status.body.state, status.body.detail], ["insufficient-credits", "Out of credits until Nov 1."]);
    const caches = readdirSync(dir).map((name) => path.join(dir, name, "read-aloud")).filter(existsSync);
    assert.ok(!caches.some((cache) => existsSync(path.join(cache, `${broke.body.audioKey}.mp3.partial`))), "the partial recording is removed");
  } finally {
    fake.streamMode = 200;
    await poor.close();
  }
});

test("the cache is pruned oldest first above its limit", async () => {
  const small = await open({ apiKey: "test-key", baseUrl: fake.url, cacheBytes: 400 });
  try {
    for (const text of ["First section to cache.", "Second section to cache.", "Third section to cache."]) {
      const prepared = await json(await call(small, "/api/read-aloud/prepare", { body: { text } }));
      await (await call(small, prepared.body.timingsUrl, { method: "GET" })).arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const caches = readdirSync(dir).map((name) => path.join(dir, name, "read-aloud")).filter(existsSync);
    const sizes = caches.map((cache) => readdirSync(cache).length);
    assert.ok(sizes.some((count) => count > 0 && count < 9), `files were pruned (${sizes})`);
  } finally { await small.close(); }
});
