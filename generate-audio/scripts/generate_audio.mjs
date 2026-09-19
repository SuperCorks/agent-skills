#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findOnPath, isEntrypoint, voxtralAvailability, withVoxtralLock } from "./voxtral_runtime.mjs";

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "voxtral_worker.py");

const DEFAULT_SPEECHIFY_BASE_URL = "https://api.speechify.ai";
const DEFAULT_SPEECHIFY_VOICE_ID = "harper_32";
const DEFAULT_SPEECHIFY_MODEL_ID = "simba-english";
const DEFAULT_SPEECHIFY_SPEED = 1.1;
const DEFAULT_SPEECHIFY_LANGUAGE = "en-US";
const DEFAULT_TIMEOUT_MS = 180_000;
const SPEECHIFY_MAX_INPUT_CHARACTERS = 20_000;
const STORY_AUDIO_LEAD_IN = '<break time="0.3s" />';

const DEFAULT_VOXTRAL_VOICE = "neutral_female";
const DEFAULT_VOXTRAL_TIMEOUT_MS = 45 * 60_000;
const VOXTRAL_MAX_FRAMES = 1_500;
const PARAGRAPH_PAUSE_SECONDS = 0.4;
// Measured on an M3 Max with the bf16 model: ~2.9 spoken words per second,
// generated at ~0.55x real time.
const WORDS_PER_SECOND = 2.9;
const GENERATION_SECONDS_PER_AUDIO_SECOND = 1.8;

export const VOXTRAL_VOICES = Object.freeze([
  "casual_female", "casual_male", "cheerful_female", "neutral_female", "neutral_male",
  "ar_male", "de_female", "de_male", "es_female", "es_male", "fr_female", "fr_male",
  "hi_female", "hi_male", "it_female", "it_male", "nl_female", "nl_male", "pt_female", "pt_male"
]);

// Voxtral sometimes fumbles the first word or two of an input. Very short inputs
// fail badly (3 of 8 takes of a 10-word sentence were garbled), so chunks are
// never shorter than minWords unless the whole text is. Longer chunks still lose
// their first word now and then (3 of 9 openings in testing), so fewer, larger
// chunks are better than many small ones.
export const CHUNK_LIMITS = Object.freeze({ minWords: 25, targetWords: 80, maxWords: 120 });
const PARAGRAPH_BREAK_WORDS = 50;

function usage() {
  return `Usage: node generate_audio.mjs (--text-file <path> | --text <string>) --output <audio.mp3|audio.wav> [options]

Options:
      --text-file <path>             UTF-8 text to speak
      --text <string>                Text to speak, inline
  -o, --output <path>                Destination .mp3 or .wav file
      --provider <name>              auto, voxtral, or speechify (default: auto)
      --voice <name>                 Voxtral voice preset (default: ${DEFAULT_VOXTRAL_VOICE})
      --speed <factor>               Playback speed, 0.5-2 (default: 1 for Voxtral; the
                                     managed profile speed for Speechify)
      --speechify-base-url <url>     Speechify API base URL
      --env-file <path>              Additional .env file for provider configuration
      --overwrite                    Replace an existing output file
      --dry-run                      Report the provider and plan without generating audio
  -h, --help                         Show this help

auto uses local Voxtral when the shared runtime is installed on Apple Silicon and
falls back to Speechify (paid) otherwise, or when Voxtral fails. The JSON result
always names the provider that ran and why.
`;
}

export function parseArgs(argv) {
  const options = {
    textFile: null,
    text: null,
    output: null,
    provider: "auto",
    voice: null,
    speed: null,
    speechifyBaseUrl: null,
    envFile: null,
    overwrite: false,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = () => {
      index += 1;
      const value = argv[index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      return value;
    };

    if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "--text-file") options.textFile = nextValue();
    else if (argument === "--text") options.text = nextValue();
    else if (argument === "-o" || argument === "--output") options.output = nextValue();
    else if (argument === "--provider") options.provider = nextValue();
    else if (argument === "--voice") options.voice = nextValue();
    else if (argument === "--speed") options.speed = nextValue();
    else if (argument === "--speechify-base-url") options.speechifyBaseUrl = nextValue();
    else if (argument === "--env-file") options.envFile = nextValue();
    else if (argument === "--overwrite") options.overwrite = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (options.help) return options;
  if (!options.textFile && !options.text) throw new Error("--text-file or --text is required.");
  if (options.textFile && options.text) throw new Error("Pass --text-file or --text, not both.");
  if (!options.output) throw new Error("--output is required.");
  if (!["auto", "voxtral", "speechify"].includes(options.provider)) {
    throw new Error("--provider must be auto, voxtral, or speechify.");
  }
  if (options.voice && !VOXTRAL_VOICES.includes(options.voice)) {
    throw new Error(`--voice must be one of: ${VOXTRAL_VOICES.join(", ")}.`);
  }
  return options;
}

export function parseEnvText(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

async function readEnvFile(filePath) {
  if (!filePath) return {};
  try {
    return parseEnvText(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Could not read environment file ${filePath}: ${error.message}`);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

async function loadEnvironment(explicitEnvFile) {
  const candidates = unique([
    explicitEnvFile,
    process.env.GENERATE_AUDIO_ENV_FILE,
    process.env.AUDIO_SUMMARY_ENV_FILE,
    path.join(os.homedir(), ".config", "tldr-audio-digest", ".env"),
    path.join(os.homedir(), "supercorks", "tldr-audio-digest", ".env.local")
  ]);

  const fileEnvironment = {};
  for (const candidate of [...candidates].reverse()) {
    Object.assign(fileEnvironment, await readEnvFile(candidate));
  }
  return { ...fileEnvironment, ...process.env };
}

function loginShellValue(name) {
  if (name !== "SPEECHIFY_API_KEY") return "";
  try {
    return execFileSync(
      "/bin/zsh",
      ["-ilc", `command printf '%s' "\${${name}:-}"`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000
      }
    ).trim();
  } catch {
    return "";
  }
}

function numberSetting(value, fallback, label) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function normalizeBaseUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitLongUnit(text, maxWords) {
  const pieces = [];
  let current = [];
  let currentWords = 0;
  const flush = () => {
    if (current.length) pieces.push(current.join(" "));
    current = [];
    currentWords = 0;
  };

  for (const clause of text.split(/(?<=[,;:])\s+/)) {
    const clauseWords = clause.split(/\s+/).filter(Boolean);
    if (clauseWords.length > maxWords) {
      flush();
      for (let index = 0; index < clauseWords.length; index += maxWords) {
        pieces.push(clauseWords.slice(index, index + maxWords).join(" "));
      }
      continue;
    }
    if (currentWords + clauseWords.length > maxWords) flush();
    current.push(clause);
    currentWords += clauseWords.length;
  }
  flush();
  return pieces;
}

function speechUnits(text, maxWords) {
  const units = [];
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?]["')\]]*)\s+/).filter(Boolean);
    const pieces = sentences.flatMap((sentence) =>
      countWords(sentence) > maxWords ? splitLongUnit(sentence, maxWords) : [sentence]
    );
    pieces.forEach((piece, index) => {
      units.push({
        text: piece,
        words: countWords(piece),
        paragraphEnd: index === pieces.length - 1
      });
    });
  }
  return units;
}

function chunkFromUnits(units) {
  return {
    text: units.map((unit) => unit.text).join(" "),
    words: units.reduce((total, unit) => total + unit.words, 0),
    paragraphEnd: units[units.length - 1].paragraphEnd
  };
}

function rebalanceTail(previousUnits, lastUnits, { minWords, maxWords }) {
  const units = [...previousUnits, ...lastUnits];
  const total = units.reduce((sum, unit) => sum + unit.words, 0);
  if (total <= maxWords) return [units];

  let best = null;
  let leftWords = 0;
  for (let index = 1; index < units.length; index += 1) {
    leftWords += units[index - 1].words;
    const rightWords = total - leftWords;
    if (leftWords < minWords || rightWords < minWords || leftWords > maxWords || rightWords > maxWords) {
      continue;
    }
    const imbalance = Math.abs(leftWords - rightWords);
    if (!best || imbalance < best.imbalance) best = { index, imbalance };
  }
  if (best) return [units.slice(0, best.index), units.slice(best.index)];

  // No sentence boundary satisfies both limits, so split mid-sentence.
  const words = units.map((unit) => unit.text).join(" ").split(" ");
  const half = Math.ceil(words.length / 2);
  const paragraphEnd = units[units.length - 1].paragraphEnd;
  return [
    [{ text: words.slice(0, half).join(" "), words: half, paragraphEnd: false }],
    [{ text: words.slice(half).join(" "), words: words.length - half, paragraphEnd }]
  ];
}

export function chunkText(text, limits = CHUNK_LIMITS) {
  const { minWords, targetWords, maxWords } = limits;
  const groups = [];
  let current = [];
  let currentWords = 0;
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    currentWords = 0;
  };

  for (const unit of speechUnits(text, maxWords)) {
    if (currentWords + unit.words > maxWords) flush();
    current.push(unit);
    currentWords += unit.words;
    if (currentWords >= targetWords || (unit.paragraphEnd && currentWords >= PARAGRAPH_BREAK_WORDS)) {
      flush();
    }
  }
  flush();

  if (groups.length > 1) {
    const lastWords = groups[groups.length - 1].reduce((sum, unit) => sum + unit.words, 0);
    if (lastWords < minWords) {
      const last = groups.pop();
      const previous = groups.pop();
      groups.push(...rebalanceTail(previous, last, limits));
    }
  }
  return groups.map(chunkFromUnits);
}

export function planProvider({ requested, availability }) {
  if (requested === "speechify") return { provider: "speechify", fallbackReason: null };
  if (availability.available) return { provider: "voxtral", fallbackReason: null };
  if (requested === "voxtral") {
    throw new Error(
      availability.reason === "unsupported-platform"
        ? "--provider voxtral requires macOS on Apple Silicon."
        : "--provider voxtral requires the shared runtime. Run scripts/install_voxtral.mjs first."
    );
  }
  return { provider: "speechify", fallbackReason: availability.reason };
}

function escapeSsml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function speechifySsmlContent(value) {
  return escapeSsml(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, '<break strength="weak" />')
    .replace(/\n/g, '<break time="250ms" />');
}

export function buildSpeechifyRequest({ narration, voiceId, modelId, speed, language }) {
  const ratePercent = Math.round((speed - 1) * 100);
  const rate = `${ratePercent >= 0 ? "+" : ""}${ratePercent}%`;
  return {
    input: `<speak>${STORY_AUDIO_LEAD_IN}<prosody rate="${rate}">${speechifySsmlContent(narration)}</prosody></speak>`,
    voice_id: voiceId,
    model: modelId,
    language
  };
}

export async function synthesizeSpeechify({ apiKey, baseUrl, request, timeoutMs }) {
  if (request.input.length > SPEECHIFY_MAX_INPUT_CHARACTERS) {
    throw new Error(
      `Speechify input is ${request.input.length} characters; the limit is ${SPEECHIFY_MAX_INPUT_CHARACTERS}.`
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/v1/audio/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "audio/mpeg",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Speechify rejected the managed Swipe News credential.");
      }
      if (response.status === 402 || response.status === 429) {
        throw new Error("The managed Speechify account has no available credits.");
      }
      if (response.status === 404 || response.status === 422) {
        throw new Error("Speechify could not use the managed Swipe News voice profile.");
      }
      throw new Error(`Speechify request failed (${response.status} ${response.statusText}).`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      throw new Error(`Speechify returned an unexpected content type: ${contentType || "missing"}.`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) throw new Error("Speechify returned an empty audio response.");
    return { audio, contentType };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Speechify request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertOutputAvailable(outputPath, overwrite) {
  try {
    await fs.access(outputPath, fsConstants.F_OK);
    if (!overwrite) {
      throw new Error(`Output already exists: ${outputPath}. Pass --overwrite to replace it.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function writeFileAtomic(outputPath, contents) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents);
    await fs.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function runProcess(command, args, { timeoutMs, onStderrLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = timeoutMs ? setTimeout(() => child.kill("SIGKILL"), timeoutMs) : null;
    let stdout = "";
    let stderrTail = "";
    let pending = "";

    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => {
      pending += data;
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        stderrTail = line.trim();
        onStderrLine?.(line);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else if (signal === "SIGKILL" && timeoutMs) reject(new Error(`timed out after ${timeoutMs}ms`));
      else reject(new Error(stderrTail || `exited with code ${code}`));
    });
  });
}

function encoderArguments(extension) {
  return extension === ".wav"
    ? ["-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav"]
    : ["-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-f", "mp3"];
}

async function encodeWithFfmpeg({ ffmpeg, inputs, filter, outputPath }) {
  const extension = path.extname(outputPath).toLowerCase();
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await runProcess(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      ...inputs.flatMap((input) => ["-i", input]),
      ...(filter ? ["-filter_complex", filter, "-map", "[out]"] : []),
      ...encoderArguments(extension),
      temporaryPath
    ]);
    await fs.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(`ffmpeg failed: ${error.message}`);
  }
}

// Voxtral clips already carry roughly half a second of lead-in and a third of a
// second of tail, which reads as a sentence pause, so chunks inside a paragraph
// are joined without extra silence. Voices differ in level by up to 20 dB, hence
// the loudness normalization.
export function assemblyFilter(chunks, speed) {
  const labels = chunks.map((chunk, index) => {
    const isLast = index === chunks.length - 1;
    if (chunk.paragraphEnd && !isLast) {
      return { stage: `[${index}:a]apad=pad_dur=${PARAGRAPH_PAUSE_SECONDS}[c${index}]`, label: `[c${index}]` };
    }
    return { stage: null, label: `[${index}:a]` };
  });
  const stages = labels.map((entry) => entry.stage).filter(Boolean);
  const tempo = speed === 1 ? "" : `,atempo=${speed}`;
  stages.push(
    `${labels.map((entry) => entry.label).join("")}concat=n=${chunks.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11${tempo}[out]`
  );
  return stages.join(";");
}

async function generateWithVoxtral({ availability, chunks, voice, speed, outputPath, environment, stderr }) {
  const ffmpeg = await findOnPath("ffmpeg", environment);
  if (!ffmpeg) throw new Error("ffmpeg is not on PATH");
  const timeoutMs = numberSetting(
    environment.GENERATE_AUDIO_VOXTRAL_TIMEOUT_MS,
    DEFAULT_VOXTRAL_TIMEOUT_MS,
    "GENERATE_AUDIO_VOXTRAL_TIMEOUT_MS"
  );

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "generate-audio-"));
  try {
    const jobChunks = chunks.map((chunk, index) => ({
      text: chunk.text,
      output: path.join(directory, `chunk_${String(index).padStart(3, "0")}.wav`)
    }));
    const jobPath = path.join(directory, "job.json");
    await fs.writeFile(
      jobPath,
      JSON.stringify({
        model: availability.manifest.model,
        voice,
        maxFrames: VOXTRAL_MAX_FRAMES,
        chunks: jobChunks
      })
    );

    const result = await withVoxtralLock(
      availability.runtime,
      async () =>
        JSON.parse(
          await runProcess(availability.runtime.python, [WORKER_PATH, jobPath], {
            timeoutMs,
            onStderrLine: (line) => {
              if (line.startsWith("voxtral_worker:")) stderr.write(`${line}\n`);
            }
          })
        ),
      { environment }
    );

    await encodeWithFfmpeg({
      ffmpeg,
      inputs: jobChunks.map((chunk) => chunk.output),
      filter: assemblyFilter(chunks, speed),
      outputPath
    });
    const rawSeconds = result.chunks.reduce((total, chunk) => total + chunk.audioSeconds, 0);
    return { audioSeconds: Math.round((rawSeconds / speed) * 10) / 10 };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function generateWithSpeechify({ text, speed, outputPath, options, environment }) {
  const apiKey = environment.SPEECHIFY_API_KEY || loginShellValue("SPEECHIFY_API_KEY");
  if (!apiKey) throw new Error("SPEECHIFY_API_KEY is required for Speechify synthesis.");

  const baseUrl = normalizeBaseUrl(
    options.speechifyBaseUrl || DEFAULT_SPEECHIFY_BASE_URL,
    "The Speechify base URL"
  );
  const timeoutMs = numberSetting(
    environment.GENERATE_AUDIO_TIMEOUT_MS || environment.AUDIO_SUMMARY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "GENERATE_AUDIO_TIMEOUT_MS"
  );
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new Error("GENERATE_AUDIO_TIMEOUT_MS must be an integer of at least 1000.");
  }

  const voiceId = environment.SPEECHIFY_VOICE_ID || DEFAULT_SPEECHIFY_VOICE_ID;
  const synthesized = await synthesizeSpeechify({
    apiKey,
    baseUrl,
    timeoutMs,
    request: buildSpeechifyRequest({
      narration: text,
      voiceId,
      modelId: environment.SPEECHIFY_MODEL_ID || DEFAULT_SPEECHIFY_MODEL_ID,
      speed,
      language: environment.SPEECHIFY_LANGUAGE || DEFAULT_SPEECHIFY_LANGUAGE
    })
  });

  if (path.extname(outputPath).toLowerCase() === ".mp3") {
    await writeFileAtomic(outputPath, synthesized.audio);
    return { voice: voiceId };
  }

  const ffmpeg = await findOnPath("ffmpeg", environment);
  if (!ffmpeg) throw new Error("ffmpeg is required to write .wav output from Speechify.");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "generate-audio-"));
  try {
    const sourcePath = path.join(directory, "speechify.mp3");
    await fs.writeFile(sourcePath, synthesized.audio);
    await encodeWithFfmpeg({ ffmpeg, inputs: [sourcePath], filter: null, outputPath });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
  return { voice: voiceId };
}

function resolveSpeed(optionValue, environmentValue, environmentLabel) {
  const fromOption = optionValue !== null && optionValue !== undefined;
  const label = fromOption ? "--speed" : environmentLabel;
  const speed = numberSetting(fromOption ? optionValue : environmentValue, null, label);
  if (speed !== null && (speed < 0.5 || speed > 2)) throw new Error(`${label} must be between 0.5 and 2.`);
  return speed;
}

export async function main(
  argv = process.argv.slice(2),
  { platform, arch, stdout = process.stdout, stderr = process.stderr } = {}
) {
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(usage());
    return;
  }

  const outputPath = path.resolve(options.output);
  if (![".mp3", ".wav"].includes(path.extname(outputPath).toLowerCase())) {
    throw new Error("--output must use the .mp3 or .wav extension.");
  }
  await assertOutputAvailable(outputPath, options.overwrite);

  const environment = await loadEnvironment(options.envFile);
  const text = (options.text ?? (await fs.readFile(path.resolve(options.textFile), "utf8"))).trim();
  if (!text) throw new Error("The text to speak is empty.");

  const availability = await voxtralAvailability({ environment, platform, arch });
  const plan = planProvider({ requested: options.provider, availability });
  const chunks = chunkText(text);
  const words = countWords(text);
  const voxtralVoice = options.voice || environment.GENERATE_AUDIO_VOICE || DEFAULT_VOXTRAL_VOICE;
  if (!VOXTRAL_VOICES.includes(voxtralVoice)) {
    throw new Error(`GENERATE_AUDIO_VOICE must be one of: ${VOXTRAL_VOICES.join(", ")}.`);
  }
  const voxtralSpeed = resolveSpeed(options.speed, environment.GENERATE_AUDIO_SPEED, "GENERATE_AUDIO_SPEED") ?? 1;
  const speechifySpeed =
    resolveSpeed(options.speed, environment.SPEECHIFY_VOICE_SPEED, "SPEECHIFY_VOICE_SPEED") ??
    DEFAULT_SPEECHIFY_SPEED;

  if (options.dryRun) {
    const audioSeconds = Math.round(words / WORDS_PER_SECOND / voxtralSpeed);
    stdout.write(
      `${JSON.stringify({
        dryRun: true,
        requestedProvider: options.provider,
        provider: plan.provider,
        fallbackReason: plan.fallbackReason,
        paidCall: plan.provider === "speechify",
        runtimePath: availability.runtime.home,
        voice: plan.provider === "voxtral" ? voxtralVoice : environment.SPEECHIFY_VOICE_ID || DEFAULT_SPEECHIFY_VOICE_ID,
        speed: plan.provider === "voxtral" ? voxtralSpeed : speechifySpeed,
        words,
        chunks: plan.provider === "voxtral" ? chunks.length : 1,
        estimate:
          plan.provider === "voxtral"
            ? {
                audioSeconds,
                generationSeconds: Math.round(audioSeconds * voxtralSpeed * GENERATION_SECONDS_PER_AUDIO_SECOND)
              }
            : null,
        outputPath
      })}\n`
    );
    return;
  }

  const started = Date.now();
  let provider = plan.provider;
  let fallbackReason = plan.fallbackReason;
  let details = null;

  if (provider === "voxtral") {
    try {
      details = await generateWithVoxtral({
        availability,
        chunks,
        voice: voxtralVoice,
        speed: voxtralSpeed,
        outputPath,
        environment,
        stderr
      });
    } catch (error) {
      if (options.provider === "voxtral") throw new Error(`Voxtral failed: ${error.message}`);
      provider = "speechify";
      fallbackReason = `voxtral-failed: ${error.message}`;
    }
  }

  if (provider === "speechify") {
    if (fallbackReason) {
      stderr.write(`Generate Audio: using Speechify (paid) because ${fallbackReason}\n`);
    }
    try {
      details = await generateWithSpeechify({ text, speed: speechifySpeed, outputPath, options, environment });
    } catch (error) {
      if (!fallbackReason) throw error;
      throw new Error(`Voxtral was not used (${fallbackReason}) and the Speechify fallback failed: ${error.message}`);
    }
  }

  const stats = await fs.stat(outputPath);
  stdout.write(
    `${JSON.stringify({
      outputPath,
      bytes: stats.size,
      requestedProvider: options.provider,
      provider,
      fallbackReason,
      voice: provider === "voxtral" ? voxtralVoice : details.voice,
      speed: provider === "voxtral" ? voxtralSpeed : speechifySpeed,
      words,
      chunks: provider === "voxtral" ? chunks.length : 1,
      audioSeconds: details.audioSeconds ?? null,
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10
    })}\n`
  );
}

if (isEntrypoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Generate Audio: ${error.message}\n`);
    process.exitCode = 1;
  });
}
