import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHUNK_LIMITS,
  assemblyFilter,
  buildSpeechifyRequest,
  chunkText,
  main,
  parseArgs,
  parseEnvText,
  planProvider
} from "../scripts/generate_audio.mjs";
import { versionAtLeast } from "../scripts/install_voxtral.mjs";
import { resolveRuntime, voxtralAvailability, withVoxtralLock } from "../scripts/voxtral_runtime.mjs";

const APPLE_SILICON = { platform: "darwin", arch: "arm64" };
const SPEECHIFY_KEY = "speechify-test-key";
const EXPECTED_AUDIO = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);

function words(count, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
}

function sentence(count, prefix) {
  return `${words(count, prefix)}.`;
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function capture() {
  const lines = [];
  return { stream: { write: (value) => lines.push(String(value)) }, text: () => lines.join("") };
}

async function temporaryDirectory(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "generate-audio-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function speechifyStub(context) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      });
      response.writeHead(200, { "content-type": "audio/mpeg" });
      response.end(EXPECTED_AUDIO);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return { requests, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

// Runs main with an isolated environment so the developer's real shared runtime
// and credentials never influence a test.
async function runMain(argv, environment, deps = APPLE_SILICON) {
  const names = ["GENERATE_AUDIO_HOME", "SPEECHIFY_API_KEY", "SPEECHIFY_VOICE_ID", "SPEECHIFY_VOICE_SPEED", "GENERATE_AUDIO_ENV_FILE", "AUDIO_SUMMARY_ENV_FILE"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, environment);

  const stdout = capture();
  const stderr = capture();
  try {
    await main(argv, { ...deps, stdout: stdout.stream, stderr: stderr.stream });
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  return { stdout: stdout.text(), stderr: stderr.text(), result: stdout.text() ? JSON.parse(stdout.text()) : null };
}

async function fakeRuntime(home, workerScript) {
  const bin = path.join(home, "voxtral", "venv", "bin");
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, "python"), workerScript, { mode: 0o755 });
  await fs.writeFile(
    path.join(home, "install.json"),
    JSON.stringify({ schema: 1, model: { repo: "test/model", revision: "test" } })
  );
}

test("parseArgs defaults to automatic provider selection", () => {
  assert.deepEqual(parseArgs(["--text-file", "narration.txt", "--output", "audio.mp3"]), {
    textFile: "narration.txt",
    text: null,
    output: "audio.mp3",
    provider: "auto",
    voice: null,
    speed: null,
    speechifyBaseUrl: null,
    envFile: null,
    overwrite: false,
    dryRun: false,
    help: false
  });
});

test("parseArgs rejects ambiguous text sources, unknown providers, and unknown voices", () => {
  assert.throws(() => parseArgs(["--output", "a.mp3"]), /--text-file or --text is required/);
  assert.throws(() => parseArgs(["--text", "a", "--text-file", "b", "--output", "a.mp3"]), /not both/);
  assert.throws(() => parseArgs(["--text", "a", "--output", "a.mp3", "--provider", "elevenlabs"]), /--provider must be/);
  assert.throws(() => parseArgs(["--text", "a", "--output", "a.mp3", "--voice", "harper_32"]), /--voice must be one of/);
});

test("parseEnvText reads the Speechify credential and the Swipe News profile", () => {
  assert.deepEqual(
    parseEnvText(`
SPEECHIFY_API_KEY=speechify-secret
SPEECHIFY_VOICE_ID=harper_32
SPEECHIFY_MODEL_ID="simba-english"
export SPEECHIFY_VOICE_SPEED=1.1
SPEECHIFY_LANGUAGE='en-US'
    `),
    {
      SPEECHIFY_API_KEY: "speechify-secret",
      SPEECHIFY_VOICE_ID: "harper_32",
      SPEECHIFY_MODEL_ID: "simba-english",
      SPEECHIFY_VOICE_SPEED: "1.1",
      SPEECHIFY_LANGUAGE: "en-US"
    }
  );
});

test("buildSpeechifyRequest matches the managed Swipe News voice shape", () => {
  assert.deepEqual(
    buildSpeechifyRequest({
      narration: "R&D < APIs.\n\nValidation passed.",
      voiceId: "harper_32",
      modelId: "simba-english",
      speed: 1.1,
      language: "en-US"
    }),
    {
      input: '<speak><break time="0.3s" /><prosody rate="+10%">R&amp;D &lt; APIs.<break strength="weak" />Validation passed.</prosody></speak>',
      voice_id: "harper_32",
      model: "simba-english",
      language: "en-US"
    }
  );
});

test("chunkText keeps every chunk within the word limits and preserves the text", () => {
  const text = [
    [sentence(30, "a"), sentence(28, "b"), sentence(35, "c")].join(" "),
    [sentence(12, "d"), sentence(14, "e")].join(" "),
    [sentence(40, "f"), sentence(45, "g"), sentence(38, "h"), sentence(9, "i")].join(" ")
  ].join("\n\n");

  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.words >= CHUNK_LIMITS.minWords, `chunk of ${chunk.words} words is below the minimum`);
    assert.ok(chunk.words <= CHUNK_LIMITS.maxWords, `chunk of ${chunk.words} words is above the maximum`);
    assert.equal(chunk.words, chunk.text.split(" ").length);
  }
  assert.equal(chunks.map((chunk) => chunk.text).join(" "), normalize(text));
  assert.equal(chunks[chunks.length - 1].paragraphEnd, true);
});

test("chunkText leaves a short text as one chunk", () => {
  const chunks = chunkText("The morning train to Lisbon leaves in exactly ten minutes.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].words, 10);
});

test("chunkText rebalances a short tail instead of emitting it alone", () => {
  // 80 words closes the first chunk; the 10-word remainder is below the minimum.
  const text = [sentence(40, "a"), sentence(40, "b"), sentence(10, "c")].join(" ");
  const chunks = chunkText(text);
  assert.deepEqual(chunks.map((chunk) => chunk.words), [90]);

  // Too long to merge (130 words), so the tail is rebalanced at a sentence boundary.
  const longer = [sentence(60, "a"), sentence(55, "b"), sentence(15, "c")].join(" ");
  const rebalanced = chunkText(longer);
  assert.deepEqual(rebalanced.map((chunk) => chunk.words), [60, 70]);
  assert.equal(rebalanced.map((chunk) => chunk.text).join(" "), normalize(longer));
});

test("chunkText splits a sentence longer than the maximum", () => {
  const runOn = `${words(100, "a")}, ${words(100, "b")}, ${words(70, "c")}.`;
  const chunks = chunkText(runOn);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) assert.ok(chunk.words <= CHUNK_LIMITS.maxWords);
  assert.equal(chunks.map((chunk) => chunk.text).join(" "), normalize(runOn));

  const unpunctuated = words(300, "z");
  const hardSplit = chunkText(unpunctuated);
  for (const chunk of hardSplit) assert.ok(chunk.words <= CHUNK_LIMITS.maxWords);
  assert.equal(hardSplit.map((chunk) => chunk.text).join(" "), unpunctuated);
});

test("planProvider prefers Voxtral and explains every fallback", () => {
  const installed = { available: true, reason: null };
  const missing = { available: false, reason: "voxtral-not-installed" };
  const unsupported = { available: false, reason: "unsupported-platform" };

  assert.deepEqual(planProvider({ requested: "auto", availability: installed }), { provider: "voxtral", fallbackReason: null });
  assert.deepEqual(planProvider({ requested: "auto", availability: missing }), { provider: "speechify", fallbackReason: "voxtral-not-installed" });
  assert.deepEqual(planProvider({ requested: "auto", availability: unsupported }), { provider: "speechify", fallbackReason: "unsupported-platform" });
  assert.deepEqual(planProvider({ requested: "speechify", availability: installed }), { provider: "speechify", fallbackReason: null });
  assert.throws(() => planProvider({ requested: "voxtral", availability: missing }), /install_voxtral\.mjs/);
  assert.throws(() => planProvider({ requested: "voxtral", availability: unsupported }), /Apple Silicon/);
});

test("assemblyFilter pauses only at paragraph breaks and applies speed last", () => {
  const chunks = [{ paragraphEnd: false }, { paragraphEnd: true }, { paragraphEnd: true }];
  assert.equal(
    assemblyFilter(chunks, 1.1),
    "[1:a]apad=pad_dur=0.4[c1];[0:a][c1][2:a]concat=n=3:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11,atempo=1.1[out]"
  );
  assert.equal(
    assemblyFilter([{ paragraphEnd: true }], 1),
    "[0:a]concat=n=1:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]"
  );
});

test("resolveRuntime is independent of the skill copy that asks", () => {
  assert.equal(resolveRuntime({ GENERATE_AUDIO_HOME: "/shared/audio" }).home, "/shared/audio");
  assert.equal(resolveRuntime({ XDG_DATA_HOME: "/xdg" }).home, "/xdg/generate-audio");
  assert.equal(resolveRuntime({}).home, path.join(os.homedir(), ".local", "share", "generate-audio"));
  assert.equal(resolveRuntime({}).python, path.join(os.homedir(), ".local", "share", "generate-audio", "voxtral", "venv", "bin", "python"));
});

test("voxtralAvailability reports why Voxtral cannot run", async (context) => {
  const home = await temporaryDirectory(context);
  const environment = { GENERATE_AUDIO_HOME: home };

  assert.equal((await voxtralAvailability({ environment, platform: "linux", arch: "x64" })).reason, "unsupported-platform");
  assert.equal((await voxtralAvailability({ environment, ...APPLE_SILICON })).reason, "voxtral-not-installed");

  await fakeRuntime(home, "#!/bin/sh\nexit 0\n");
  const availability = await voxtralAvailability({ environment, ...APPLE_SILICON });
  assert.equal(availability.available, true);
  assert.equal(availability.manifest.model.repo, "test/model");
});

test("versionAtLeast compares dotted versions numerically", () => {
  assert.equal(versionAtLeast("1.11.7", "1.10"), true);
  assert.equal(versionAtLeast("1.10.0", "1.10"), true);
  assert.equal(versionAtLeast("1.9.1", "1.10"), false);
  assert.equal(versionAtLeast("2.0.0", "1.10"), true);
});

test("withVoxtralLock serializes jobs and recovers a lock left by a dead process", async (context) => {
  const home = await temporaryDirectory(context);
  const runtime = resolveRuntime({ GENERATE_AUDIO_HOME: home });

  const events = [];
  const job = (name, delay) =>
    withVoxtralLock(runtime, async () => {
      events.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      events.push(`${name}:end`);
    });
  await Promise.all([job("first", 150), job("second", 10)]);
  assert.equal(events[0].split(":")[1], "start");
  assert.equal(events[1], `${events[0].split(":")[0]}:end`, "the second job started before the first finished");

  await fs.mkdir(runtime.lockDir, { recursive: true });
  await fs.writeFile(path.join(runtime.lockDir, "owner.json"), JSON.stringify({ pid: 2 ** 22 + 12345 }));
  assert.equal(await withVoxtralLock(runtime, async () => "recovered", { timeoutMs: 5_000 }), "recovered");
  await assert.rejects(fs.access(runtime.lockDir), "the lock is released after the job");
});

test("main falls back to Speechify and says why when Voxtral is not installed", async (context) => {
  const directory = await temporaryDirectory(context);
  const stub = await speechifyStub(context);
  const outputPath = path.join(directory, "audio.mp3");

  const { result, stdout, stderr } = await runMain(
    ["--text", "The task completed and validation passed.", "--output", outputPath, "--speed", "1.1", "--speechify-base-url", stub.baseUrl],
    { GENERATE_AUDIO_HOME: path.join(directory, "empty-runtime"), SPEECHIFY_API_KEY: SPEECHIFY_KEY }
  );

  assert.equal(result.requestedProvider, "auto");
  assert.equal(result.provider, "speechify");
  assert.equal(result.fallbackReason, "voxtral-not-installed");
  assert.equal(result.voice, "harper_32");
  assert.match(stderr, /using Speechify \(paid\) because voxtral-not-installed/);
  assert.deepEqual(await fs.readFile(outputPath), EXPECTED_AUDIO);
  assert.equal(stub.requests.length, 1);
  assert.equal(stub.requests[0].url, "/v1/audio/stream");
  assert.equal(stub.requests[0].authorization, `Bearer ${SPEECHIFY_KEY}`);
  assert.match(stub.requests[0].body.input, /prosody rate="\+10%"/);
  assert.ok(!stdout.includes(SPEECHIFY_KEY) && !stderr.includes(SPEECHIFY_KEY), "credentials must never be printed");
});

test("main falls back on unsupported platforms", async (context) => {
  const directory = await temporaryDirectory(context);
  const stub = await speechifyStub(context);

  const { result } = await runMain(
    ["--text", "Validation passed.", "--output", path.join(directory, "audio.mp3"), "--speechify-base-url", stub.baseUrl],
    { GENERATE_AUDIO_HOME: path.join(directory, "empty-runtime"), SPEECHIFY_API_KEY: SPEECHIFY_KEY },
    { platform: "linux", arch: "x64" }
  );
  assert.equal(result.provider, "speechify");
  assert.equal(result.fallbackReason, "unsupported-platform");
  assert.equal(result.speed, 1.1, "Speechify keeps the managed profile speed when --speed is absent");
});

test("main falls back when the Voxtral worker fails", async (context) => {
  const directory = await temporaryDirectory(context);
  const stub = await speechifyStub(context);
  const home = path.join(directory, "runtime");
  await fakeRuntime(home, "#!/bin/sh\necho 'voxtral_worker: simulated model failure' >&2\nexit 1\n");
  const outputPath = path.join(directory, "audio.mp3");

  const { result } = await runMain(
    ["--text", "Validation passed.", "--output", outputPath, "--speechify-base-url", stub.baseUrl],
    { GENERATE_AUDIO_HOME: home, SPEECHIFY_API_KEY: SPEECHIFY_KEY }
  );
  assert.equal(result.provider, "speechify");
  assert.match(result.fallbackReason, /^voxtral-failed: /);
  assert.deepEqual(await fs.readFile(outputPath), EXPECTED_AUDIO);
  assert.equal(stub.requests.length, 1);
});

test("--provider voxtral never spends Speechify credits", async (context) => {
  const directory = await temporaryDirectory(context);
  const stub = await speechifyStub(context);
  const environment = { GENERATE_AUDIO_HOME: path.join(directory, "empty-runtime"), SPEECHIFY_API_KEY: SPEECHIFY_KEY };
  const argv = (output) => ["--text", "Validation passed.", "--output", path.join(directory, output), "--provider", "voxtral", "--speechify-base-url", stub.baseUrl];

  await assert.rejects(runMain(argv("missing.mp3"), environment), /requires the shared runtime/);

  await fakeRuntime(environment.GENERATE_AUDIO_HOME, "#!/bin/sh\necho 'voxtral_worker: simulated model failure' >&2\nexit 1\n");
  await assert.rejects(runMain(argv("failed.mp3"), environment), /Voxtral failed/);

  assert.equal(stub.requests.length, 0);
  await assert.rejects(fs.access(path.join(directory, "failed.mp3")), "no output is left behind");
});

test("--dry-run reports the plan without calling a provider or writing audio", async (context) => {
  const directory = await temporaryDirectory(context);
  const stub = await speechifyStub(context);
  const home = path.join(directory, "runtime");
  // A worker that would fail loudly proves the dry run never starts it.
  await fakeRuntime(home, "#!/bin/sh\nexit 1\n");
  const textPath = path.join(directory, "narration.txt");
  await fs.writeFile(textPath, [sentence(60, "a"), sentence(60, "b")].join("\n\n"));
  const outputPath = path.join(directory, "audio.mp3");

  const installed = await runMain(
    ["--text-file", textPath, "--output", outputPath, "--dry-run", "--speechify-base-url", stub.baseUrl],
    { GENERATE_AUDIO_HOME: home }
  );
  assert.equal(installed.result.provider, "voxtral");
  assert.equal(installed.result.voice, "casual_male", "casual_male is the default voice");
  assert.equal(installed.result.paidCall, false);
  assert.equal(installed.result.runtimePath, home);
  assert.equal(installed.result.words, 120);
  assert.equal(installed.result.chunks, 2);
  assert.ok(installed.result.estimate.generationSeconds > installed.result.estimate.audioSeconds);

  const missing = await runMain(
    ["--text-file", textPath, "--output", outputPath, "--dry-run", "--speechify-base-url", stub.baseUrl],
    { GENERATE_AUDIO_HOME: path.join(directory, "empty-runtime") }
  );
  assert.equal(missing.result.provider, "speechify");
  assert.equal(missing.result.paidCall, true);
  assert.equal(missing.result.fallbackReason, "voxtral-not-installed");

  assert.equal(stub.requests.length, 0);
  await assert.rejects(fs.access(outputPath));
});

test("main refuses to overwrite and reports a failed fallback with both causes", async (context) => {
  const directory = await temporaryDirectory(context);
  const outputPath = path.join(directory, "audio.mp3");
  await fs.writeFile(outputPath, "existing");
  const environment = { GENERATE_AUDIO_HOME: path.join(directory, "empty-runtime") };

  await assert.rejects(runMain(["--text", "Hello.", "--output", outputPath], environment), /Output already exists/);
  assert.equal(await fs.readFile(outputPath, "utf8"), "existing");

  await assert.rejects(
    runMain(["--text", "Hello.", "--output", outputPath, "--overwrite", "--speechify-base-url", "http://127.0.0.1:9"], {
      ...environment,
      SPEECHIFY_API_KEY: SPEECHIFY_KEY
    }),
    /Voxtral was not used \(voxtral-not-installed\) and the Speechify fallback failed/
  );
});

test("the scripts run when reached through a symlinked path", async (context) => {
  const directory = await temporaryDirectory(context);
  const scripts = path.dirname(fileURLToPath(new URL("../scripts/generate_audio.mjs", import.meta.url)));
  const link = path.join(directory, "linked-scripts");
  await fs.symlink(scripts, link);

  for (const script of ["generate_audio.mjs", "install_voxtral.mjs"]) {
    const output = execFileSync(process.execPath, [path.join(link, script), "--help"], { encoding: "utf8" });
    assert.match(output, new RegExp(`Usage: node ${script}`), `${script} exited without running`);
  }
});
