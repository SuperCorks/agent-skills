// Model access for the editor's AI rewrite. Default: the Codex CLI on the user's ChatGPT
// login (no per-call cost). Fallback: OpenRouter with OPENROUTER_API_KEY. Both return
// {"html": "..."} constrained by rewrite.schema.json.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_FILE = path.join(HERE, "rewrite.schema.json");
export const DEFAULT_SETTINGS = Object.freeze({ provider: "codex", model: "gpt-6-luna", effort: "low" });
export const PROVIDERS = ["codex", "openrouter"];
export const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
export const MODEL_SUGGESTIONS = ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-luna"];

export class ProviderUnavailable extends Error {}

export const SYSTEM_RULES = `You edit one fragment of an HTML report in place. Reply with JSON {"html": "..."} whose value is the rewritten fragment.
Rules:
- Return exactly one root element with the same tag, id, and class as the original fragment.
- Keep every id. Keep every <hr-keep n="N"></hr-keep> placeholder exactly once and unchanged: each stands for an image, code block, diagram, or mockup you cannot see.
- Change only what the instruction asks. Keep facts, numbers, names, dates, and links unless told otherwise. Never invent facts.
- Use plain semantic HTML and only the report's existing classes (listed below). No style attributes except a numeric --v on bar rows, no scripts, no event attributes, no images.
- Match the report's language and voice. Use <strong> only for phrases that matter to the reader's next decision.
- Do not run tools or commands; just answer.`;

export function buildPrompt({ fragment, instruction, title = "", audience = "internal", outline = "", before = "", after = "", vocabulary = [], tags = [] }) {
  return [
    `Report title: ${title || "(untitled)"}`,
    `Audience: ${audience === "client" ? "client-facing (plain, non-technical, no internal notes)" : "internal"}`,
    `Report classes: ${vocabulary.join(" ")}`,
    `Allowed tags: ${tags.join(" ")}`,
    "Report outline:",
    outline || "(none)",
    `Text just before the fragment: ${JSON.stringify(before)}`,
    `Text just after the fragment: ${JSON.stringify(after)}`,
    `Instruction: ${instruction}`,
    "Fragment to rewrite:",
    fragment
  ].join("\n");
}

function parseHtml(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text || "");
    if (match) {
      try { value = JSON.parse(match[0]); } catch { /* handled below */ }
    }
  }
  if (!value || typeof value.html !== "string") throw new Error("the model did not return {\"html\": ...}");
  return value.html;
}

const codexModel = (model) => model.replace(/^openai\//, "");
const openRouterModel = (model) => (model.includes("/") ? model : `openai/${model}`);

export function rewriteWithCodex({ prompt, model, effort, signal, codexBin = process.env.HRE_CODEX_BIN || "codex", timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const work = mkdtempSync(path.join(os.tmpdir(), "hre-codex-"));
    const empty = path.join(work, "empty");
    mkdirSync(empty);
    const out = path.join(work, "out.json");
    const args = [
      "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config",
      "-C", empty, "-s", "read-only", "-m", codexModel(model), "-c", `model_reasoning_effort="${effort}"`,
      "--output-schema", SCHEMA_FILE, "-o", out, "-"
    ];
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      rmSync(work, { recursive: true, force: true });
      if (error) reject(error);
      else resolve(value);
    };
    const child = spawn(codexBin, args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    const onAbort = () => { child.kill("SIGTERM"); finish(new Error("cancelled")); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(new Error(`codex timed out after ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    signal?.addEventListener?.("abort", onAbort);
    child.on("error", (error) => finish(error.code === "ENOENT" ? new ProviderUnavailable("the codex CLI is not installed") : error));
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (settled) return;
      const events = stdout.split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
      const failure = events.find((e) => e.type === "error" || e.type === "turn.failed");
      const usage = events.find((e) => e.type === "turn.completed")?.usage || null;
      if (code !== 0 || failure) {
        const message = (failure?.message || failure?.error?.message || stderr.split("\n").filter((l) => l && !/\bWARN\b/.test(l)).slice(-3).join(" ") || `exit ${code}`).trim();
        if (/log ?in|logged out|not logged|unauthori[sz]ed|\b401\b|authentication|auth\.json/i.test(message)) finish(new ProviderUnavailable(`codex is not logged in (${message})`));
        else finish(new Error(`codex failed: ${message}`));
        return;
      }
      try {
        finish(null, { html: parseHtml(readFileSync(out, "utf8")), usage });
      } catch (error) {
        finish(new Error(`codex returned no usable answer: ${error.message}`));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(`${SYSTEM_RULES}\n\n${prompt}`);
  });
}

function readEnvFile(file, name) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)\\s*$`).exec(line);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  } catch { /* missing file */ }
  return "";
}

let cachedKey;
/** OPENROUTER_API_KEY from the environment, the editor's env file, or a login shell. */
export function openRouterKey(env = process.env) {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = readEnvFile(path.join(os.homedir(), ".config", "html-report-editor", ".env"), "OPENROUTER_API_KEY");
  if (!cachedKey && env.HRE_NO_LOGIN_SHELL !== "1") {
    try {
      cachedKey = execFileSync("/bin/zsh", ["-ilc", "command printf '%s' \"${OPENROUTER_API_KEY:-}\""], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 }).trim();
    } catch {
      cachedKey = "";
    }
  }
  return cachedKey;
}

export async function rewriteWithOpenRouter({ prompt, model, effort, signal, apiKey = openRouterKey(), baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1" }) {
  if (!apiKey) throw new ProviderUnavailable("OPENROUTER_API_KEY is not set");
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
  const body = {
    model: openRouterModel(model),
    messages: [{ role: "system", content: SYSTEM_RULES }, { role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "rewrite", strict: true, schema } }
  };
  if (effort && effort !== "none") body.reasoning = { effort };
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "html-report-editor" },
    body: JSON.stringify(body),
    signal
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(`OpenRouter ${response.status}: ${data.error?.message || response.statusText}`);
  return { html: parseHtml(data.choices?.[0]?.message?.content || ""), usage: data.usage || null };
}

/** Rewrite with the configured provider, falling back from codex to OpenRouter when codex is unavailable. */
export async function rewrite(settings, { prompt, signal }) {
  const started = Date.now();
  const { provider, model, effort } = { ...DEFAULT_SETTINGS, ...settings };
  if (provider === "openrouter") {
    const result = await rewriteWithOpenRouter({ prompt, model, effort, signal });
    return { ...result, provider, model, ms: Date.now() - started };
  }
  try {
    const result = await rewriteWithCodex({ prompt, model, effort, signal });
    return { ...result, provider: "codex", model, ms: Date.now() - started };
  } catch (error) {
    if (!(error instanceof ProviderUnavailable)) throw error;
    if (!openRouterKey()) throw new Error(`${error.message}, and no OPENROUTER_API_KEY is available for the fallback`);
    const result = await rewriteWithOpenRouter({ prompt, model, effort, signal });
    return { ...result, provider: "openrouter", model, ms: Date.now() - started, fallback: error.message };
  }
}
