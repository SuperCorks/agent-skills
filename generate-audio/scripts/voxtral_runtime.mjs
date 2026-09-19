import { constants as fsConstants, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VOXTRAL_MODEL_REPO = "mlx-community/Voxtral-4B-TTS-2603-mlx-bf16";
export const VOXTRAL_MODEL_REVISION = "dd85c02adbae551f5bb29ded35ee60ccdfb90927";
export const VOXTRAL_PYTHON_VERSION = "3.12";
// mistral-common must be listed explicitly: left to the resolver, uv keeps an
// older numpy and silently selects mistral-common 1.9.x, which cannot read the
// Voxtral TTS tokenizer.
export const VOXTRAL_REQUIREMENTS = Object.freeze([
  "mlx-audio[tts]==0.5.4",
  "mistral-common[audio]>=1.10,<2"
]);
export const MANIFEST_SCHEMA = 1;

const DEFAULT_LOCK_TIMEOUT_MS = 30 * 60_000;
const LOCK_POLL_MS = 2_000;

// import.meta.url is always a real path, while argv[1] keeps any symlink used to
// reach the script (a symlinked skills folder, or /tmp on macOS). Comparing them
// unresolved makes the script exit silently without running.
export function isEntrypoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(moduleUrl) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

export function resolveRuntime(environment = process.env) {
  const dataHome = environment.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const home = path.resolve(environment.GENERATE_AUDIO_HOME || path.join(dataHome, "generate-audio"));
  const venvDir = path.join(home, "voxtral", "venv");
  return {
    home,
    venvDir,
    python: path.join(venvDir, "bin", "python"),
    manifestPath: path.join(home, "install.json"),
    lockDir: path.join(home, "locks", "voxtral.lock")
  };
}

export function platformSupportsVoxtral(platform = process.platform, arch = process.arch) {
  return platform === "darwin" && arch === "arm64";
}

export async function readManifest(runtime) {
  try {
    const manifest = JSON.parse(await fs.readFile(runtime.manifestPath, "utf8"));
    return manifest?.schema === MANIFEST_SCHEMA ? manifest : null;
  } catch {
    return null;
  }
}

async function isExecutable(filePath) {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findOnPath(name, environment = process.env) {
  for (const directory of (environment.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name);
    try {
      await fs.access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

export async function voxtralAvailability({
  environment = process.env,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const runtime = resolveRuntime(environment);
  if (!platformSupportsVoxtral(platform, arch)) {
    return { available: false, reason: "unsupported-platform", runtime };
  }
  const manifest = await readManifest(runtime);
  if (!manifest || !(await isExecutable(runtime.python))) {
    return { available: false, reason: "voxtral-not-installed", runtime };
  }
  return { available: true, reason: null, runtime, manifest };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function lockIsStale(lockDir) {
  try {
    const owner = JSON.parse(await fs.readFile(path.join(lockDir, "owner.json"), "utf8"));
    return !Number.isInteger(owner?.pid) || !processIsAlive(owner.pid);
  } catch {
    // The owner file is written right after mkdir; give a fresh lock a moment
    // before treating a missing owner as abandoned.
    try {
      const stats = await fs.stat(lockDir);
      return Date.now() - stats.mtimeMs > 10_000;
    } catch {
      return false;
    }
  }
}

// Voxtral peaks near 9 GB of memory, so jobs and installs from concurrent
// agents are serialized rather than run side by side.
export async function withVoxtralLock(runtime, task, { timeoutMs, environment = process.env } = {}) {
  const limit =
    timeoutMs ?? (Number(environment.GENERATE_AUDIO_LOCK_TIMEOUT_MS) || DEFAULT_LOCK_TIMEOUT_MS);
  const deadline = Date.now() + limit;
  await fs.mkdir(path.dirname(runtime.lockDir), { recursive: true });

  for (;;) {
    try {
      await fs.mkdir(runtime.lockDir);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await lockIsStale(runtime.lockDir)) {
        await fs.rm(runtime.lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Another Voxtral job held the lock for more than ${Math.round(limit / 1000)}s.`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
  }

  try {
    await fs.writeFile(
      path.join(runtime.lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })
    );
    return await task();
  } finally {
    await fs.rm(runtime.lockDir, { recursive: true, force: true });
  }
}
