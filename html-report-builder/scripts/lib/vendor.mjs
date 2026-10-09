// Pinned third-party code the builder needs only when a report has charts or diagrams:
// Plotly (inlined into charted reports) and Mermaid (build time only), downloaded once,
// checked against a SHA-256 hash, and cached; plus a headless browser through playwright-core,
// installed once into the same cache: the user's own Chrome, or Playwright's Chromium,
// downloaded once, on machines without one.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export const CACHE_DIR = process.env.HRB_CACHE_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "html-report-builder");
export const PLAYWRIGHT_VERSION = "1.64.0";
export const LIBRARIES = {
  plotly: {
    pkg: "plotly.js-cartesian-dist-min", version: "4.1.2", file: "plotly-cartesian.min.js",
    sha256: "aaf12ff1d4671f7e93f6df4291651ab4ca6b76c0ea5f1576ec1030e3c2819a20"
  },
  mermaid: {
    pkg: "mermaid", version: "12.1.0", file: "dist/mermaid.min.js",
    sha256: "6484afc32872a3aa16cac9a76ba1816a1ed4cc870a6593cc2e17757750f518b2"
  }
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const libraryTag = (name) => `${LIBRARIES[name].pkg}@${LIBRARIES[name].version}`;
export const libraryPath = (name, cacheDir = CACHE_DIR) => {
  const lib = LIBRARIES[name];
  return path.join(cacheDir, "vendor", `${lib.pkg}@${lib.version}`, path.basename(lib.file));
};

/** The cached library's text if it is present and intact, else null (never downloads). */
export function readLibrary(name, { cacheDir = CACHE_DIR } = {}) {
  const file = libraryPath(name, cacheDir);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  return sha256(bytes) === LIBRARIES[name].sha256 ? bytes.toString("utf8") : null;
}

/** Path of a pinned library, downloading and verifying it on first use. */
export async function ensureLibrary(name, { cacheDir = CACHE_DIR, fetch: fetchImpl = globalThis.fetch } = {}) {
  const lib = LIBRARIES[name];
  if (!lib) throw new Error(`unknown library ${name}`);
  const file = libraryPath(name, cacheDir);
  if (readLibrary(name, { cacheDir }) !== null) return file;
  const url = `https://cdn.jsdelivr.net/npm/${lib.pkg}@${lib.version}/${lib.file}`;
  let bytes;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`charts and diagrams need a one-time download of ${lib.pkg} ${lib.version}, which failed (${error.message}); connect to the internet and build again`);
  }
  if (sha256(bytes) !== lib.sha256) throw new Error(`${lib.pkg} ${lib.version} from ${url} does not match its pinned hash; refusing to use it`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file);
  return file;
}

const requireFrom = (dir, name) => {
  try { return createRequire(path.join(dir, "noop.js"))(name); } catch { return null; }
};

/** The pinned playwright-core in the cache, installed there on first use. */
function cachedPlaywright(cacheDir) {
  if (!existsSync(path.join(cacheDir, "node_modules", "playwright-core"))) {
    mkdirSync(cacheDir, { recursive: true });
    if (!existsSync(path.join(cacheDir, "package.json"))) writeFileSync(path.join(cacheDir, "package.json"), '{"private":true}\n');
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", `playwright-core@${PLAYWRIGHT_VERSION}`], { cwd: cacheDir, stdio: "ignore", timeout: 180_000 });
  }
  return requireFrom(cacheDir, "playwright-core");
}

/** Playwright from NODE_PATH when one is there (tests and maintainers), else the cached one. */
function loadPlaywright(cacheDir) {
  for (const dir of (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)) {
    const found = requireFrom(dir, "playwright-core") || requireFrom(dir, "playwright");
    if (found) return found;
  }
  return cachedPlaywright(cacheDir);
}

/**
 * Download Playwright's headless Chromium for the cached playwright-core, once, into
 * Playwright's usual browser folder. Used only when no installed browser starts, for example
 * on a server without Chrome.
 */
function installChromium(cacheDir) {
  const cli = path.join(cacheDir, "node_modules", "playwright-core", "cli.js");
  process.stderr.write("Downloading a headless Chromium for charts, diagrams, and PDFs (once, about 100 MB)...\n");
  execFileSync(process.execPath, [cli, "install", "--only-shell", "--no-remove", "chromium"], { stdio: "ignore", timeout: 900_000 });
}

/**
 * Run fn(browser) with a headless browser: the installed Chrome first, then Playwright's own
 * Chromium (downloaded once when nothing else starts), then Edge. Throws a reader-facing
 * error when none can start.
 */
export async function withBrowser(fn, { cacheDir = CACHE_DIR } = {}) {
  let playwright;
  try {
    playwright = loadPlaywright(cacheDir);
  } catch (error) {
    throw new Error(`could not install playwright-core into ${cacheDir} (${error.message})`);
  }
  if (!playwright) throw new Error("playwright-core is not available");
  const failures = [];
  const launch = async (driver, options) => {
    try {
      return await driver.chromium.launch({ headless: true, ...options });
    } catch (error) {
      failures.push(error.message.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" "));
      return null;
    }
  };
  let browser = await launch(playwright, { channel: "chrome" }) || await launch(playwright, {}) || await launch(playwright, { channel: "msedge" });
  if (!browser) {
    try {
      const pinned = cachedPlaywright(cacheDir);
      installChromium(cacheDir);
      browser = await launch(pinned, {});
    } catch (error) {
      failures.push(`Chromium download failed (${error.message.split("\n")[0]})`);
    }
  }
  if (!browser) throw new Error(`no headless browser could start: install Google Chrome or let Playwright download Chromium (${failures.at(-1) || "unknown error"})`);
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}
