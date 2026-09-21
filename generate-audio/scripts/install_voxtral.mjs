#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_SCHEMA,
  VOXTRAL_MODEL_REPO,
  VOXTRAL_MODEL_REVISION,
  VOXTRAL_PYTHON_VERSION,
  VOXTRAL_REQUIREMENTS,
  findOnPath,
  isEntrypoint,
  platformSupportsVoxtral,
  readManifest,
  resolveRuntime,
  withVoxtralLock
} from "./voxtral_runtime.mjs";

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "voxtral_worker.py");
const SMOKE_TEXT =
  "This is the installation check for the shared Voxtral runtime. If you can hear this sentence clearly from start to finish, local speech generation is working.";
const PACKAGES = ["mlx-audio", "mistral-common", "mlx"];

function usage() {
  return `Usage: node install_voxtral.mjs [options]

Installs the shared Voxtral TTS runtime used by every copy of the generate-audio
skill. Safe to re-run: an installation that already passes --check is left alone.

Options:
      --check    Report the state of the shared runtime without changing it
      --force    Reinstall even when the runtime already passes --check
  -h, --help     Show this help

Environment:
  GENERATE_AUDIO_HOME   Shared runtime directory (default: ~/.local/share/generate-audio)
`;
}

export function parseArgs(argv) {
  const options = { check: false, force: false, help: false };
  for (const argument of argv) {
    if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "--check") options.check = true;
    else if (argument === "--force") options.force = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function run(command, args, { capture = false, environment = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      // Tool progress belongs on stderr; stdout carries this script's JSON.
      stdio: ["ignore", capture ? "pipe" : process.stderr, capture ? "pipe" : process.stderr]
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (data) => (stdout += data));
      child.stderr.on("data", (data) => (stderr += data));
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(command)} exited with code ${code}.${stderr ? ` ${stderr.trim().split("\n").pop()}` : ""}`));
    });
  });
}

export function versionAtLeast(version, minimum) {
  const parts = (value) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [actual, wanted] = [parts(version), parts(minimum)];
  for (let index = 0; index < wanted.length; index += 1) {
    if ((actual[index] || 0) !== wanted[index]) return (actual[index] || 0) > wanted[index];
  }
  return true;
}

async function packageVersions(runtime) {
  const script = `import importlib.metadata as m, json; print(json.dumps({n: m.version(n) for n in ${JSON.stringify(PACKAGES)}}))`;
  return JSON.parse(await run(runtime.python, ["-c", script], { capture: true }));
}

async function modelIsCached(runtime) {
  const script = [
    "from huggingface_hub import snapshot_download",
    `snapshot_download(${JSON.stringify(VOXTRAL_MODEL_REPO)}, revision=${JSON.stringify(VOXTRAL_MODEL_REVISION)}, local_files_only=True)`
  ].join("; ");
  try {
    await run(runtime.python, ["-c", script], {
      capture: true,
      environment: { ...process.env, HF_HUB_OFFLINE: "1" }
    });
    return true;
  } catch {
    return false;
  }
}

export async function checkRuntime(environment = process.env) {
  const runtime = resolveRuntime(environment);
  const report = {
    ok: false,
    runtimePath: runtime.home,
    platformSupported: platformSupportsVoxtral(),
    ffmpeg: Boolean(await findOnPath("ffmpeg", environment)),
    manifest: false,
    packages: null,
    modelCached: false,
    problems: []
  };

  if (!report.platformSupported) {
    report.problems.push("Voxtral on MLX requires macOS on Apple Silicon.");
    return report;
  }
  if (!report.ffmpeg) report.problems.push("ffmpeg is not on PATH (brew install ffmpeg).");

  const manifest = await readManifest(runtime);
  report.manifest = Boolean(manifest);
  if (!manifest) {
    report.problems.push("The shared runtime is not installed (run install_voxtral.mjs).");
    return report;
  }

  try {
    report.packages = await packageVersions(runtime);
  } catch {
    report.problems.push("The shared virtual environment is missing or broken.");
    return report;
  }
  if (report.packages["mlx-audio"] !== "0.5.4") {
    report.problems.push(`mlx-audio is ${report.packages["mlx-audio"]}; 0.5.4 is required.`);
  }
  if (!versionAtLeast(report.packages["mistral-common"], "1.10")) {
    report.problems.push(`mistral-common is ${report.packages["mistral-common"]}; 1.10 or newer is required.`);
  }

  report.modelCached = await modelIsCached(runtime);
  if (!report.modelCached) report.problems.push("The pinned Voxtral model snapshot is not fully cached.");

  report.ok = report.problems.length === 0;
  return report;
}

async function smokeTest(runtime) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "generate-audio-smoke-"));
  try {
    const jobPath = path.join(directory, "job.json");
    await fs.writeFile(
      jobPath,
      JSON.stringify({
        model: { repo: VOXTRAL_MODEL_REPO, revision: VOXTRAL_MODEL_REVISION },
        voice: "casual_male",
        maxFrames: 1500,
        chunks: [{ text: SMOKE_TEXT, output: path.join(directory, "smoke.wav") }]
      })
    );
    const started = Date.now();
    const result = JSON.parse(await run(runtime.python, [WORKER_PATH, jobPath], { capture: true }));
    const audioSeconds = result.chunks[0].audioSeconds;
    if (!(audioSeconds > 2)) throw new Error(`The smoke test produced only ${audioSeconds}s of audio.`);
    return { audioSeconds, elapsedSeconds: Math.round((Date.now() - started) / 100) / 10 };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function install(runtime, environment) {
  const uv = await findOnPath("uv", environment);
  if (!uv) throw new Error("uv is required (brew install uv).");
  if (!(await findOnPath("ffmpeg", environment))) throw new Error("ffmpeg is required (brew install ffmpeg).");

  // Removing the manifest first keeps a half-finished reinstall from looking usable.
  await fs.rm(runtime.manifestPath, { force: true });
  await fs.mkdir(path.dirname(runtime.venvDir), { recursive: true });

  process.stderr.write(`Creating the shared environment in ${runtime.venvDir}\n`);
  await run(uv, ["venv", "--allow-existing", "--python", VOXTRAL_PYTHON_VERSION, runtime.venvDir]);
  await run(uv, ["pip", "install", "--python", runtime.python, ...VOXTRAL_REQUIREMENTS]);

  process.stderr.write(`Fetching ${VOXTRAL_MODEL_REPO} (about 8 GB unless already cached)\n`);
  const download = [
    "from huggingface_hub import snapshot_download",
    `snapshot_download(${JSON.stringify(VOXTRAL_MODEL_REPO)}, revision=${JSON.stringify(VOXTRAL_MODEL_REVISION)})`
  ].join("; ");
  await run(runtime.python, ["-c", download]);

  process.stderr.write("Running the smoke test\n");
  const smoke = await smokeTest(runtime);

  const manifest = {
    schema: MANIFEST_SCHEMA,
    installedAt: new Date().toISOString(),
    model: { repo: VOXTRAL_MODEL_REPO, revision: VOXTRAL_MODEL_REVISION },
    python: VOXTRAL_PYTHON_VERSION,
    packages: await packageVersions(runtime),
    smokeTest: smoke
  };
  await fs.writeFile(runtime.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  if (options.check) {
    const report = await checkRuntime(environment);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (!platformSupportsVoxtral()) {
    throw new Error(
      "Voxtral on MLX requires macOS on Apple Silicon. On this machine generate-audio uses Speechify."
    );
  }

  const runtime = resolveRuntime(environment);
  await fs.mkdir(runtime.home, { recursive: true });
  await withVoxtralLock(runtime, async () => {
    if (!options.force) {
      const report = await checkRuntime(environment);
      if (report.ok) {
        process.stdout.write(`${JSON.stringify({ installed: false, alreadyInstalled: true, ...report })}\n`);
        return;
      }
    }
    const manifest = await install(runtime, environment);
    process.stdout.write(
      `${JSON.stringify({ installed: true, alreadyInstalled: false, runtimePath: runtime.home, ...manifest })}\n`
    );
  });
}

if (isEntrypoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Generate Audio install: ${error.message}\n`);
    process.exitCode = 1;
  });
}
