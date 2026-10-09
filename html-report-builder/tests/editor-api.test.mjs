import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startEditor } from "../editor/report-editor.mjs";
import { ProviderUnavailable, TASKS, buildTranscriptPrompt, rewrite, rewriteWithCodex } from "../editor/providers.mjs";
import { buildSource } from "../scripts/lib/build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORT = buildSource(`<!doctype html>
<html lang="en" data-template="findings">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Editor test</title>
</head>
<body>
<header class="hero"><h1>Editor test</h1><p class="lede">The answer first.</p></header>
<main>
<section id="summary"><h2>At a glance</h2><p>Sync fails <strong>4%</strong> of nights.</p></section>
<section id="findings"><h2>Findings</h2>
<article class="finding risk" id="f1"><h3>Rate limits</h3><p>Evidence one.</p><pre><code>select 1;</code></pre></article>
<article class="question" id="q1"><h3>Retry for a day?</h3><p class="rec">Yes.</p><p class="answer"></p></article>
</section>
<section id="next"><h2>Next steps</h2><p>Ship it.</p></section>
</main>
</body>
</html>
`).output;

let dir;
let editor;
let cookie;
let calls = [];
let nextRewrite = null;

async function call(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(new URL(pathname, `http://127.0.0.1:${editor.port}`), {
    method, redirect: "manual",
    headers: { Cookie: cookie, Origin: `http://127.0.0.1:${editor.port}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: response.status, text, json };
}
const blockId = (page, text) => {
  const match = new RegExp(`data-hre="(b\\d+)"[^>]*>${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(page);
  assert.ok(match, `block for ${text}`);
  return match[1];
};
const scopeId = (page, attrs) => {
  const match = new RegExp(`<[a-z]+ data-hre="(c\\d+)"(?: data-hre-del)? ${attrs}`).exec(page);
  assert.ok(match, `scope for ${attrs}`);
  return match[1];
};
const state = async () => (await call("/api/state")).json;
const file = () => path.join(dir, "report.html");

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "hre-api-"));
  writeFileSync(file(), REPORT);
  editor = await startEditor({
    file: file(), port: 0, settings: { provider: "codex", model: "gpt-6-luna", effort: "low" },
    configFile: path.join(dir, "config", "config.json"), backupDir: path.join(dir, "backup"), pollMs: 50, log: () => {},
    rewrite: async (settings, { prompt }) => {
      calls.push({ settings, prompt });
      const fragment = prompt.split("Fragment to rewrite:\n")[1];
      return { html: nextRewrite ? nextRewrite(fragment) : fragment, provider: "mock", model: settings.model, ms: 5 };
    }
  });
  const login = await fetch(editor.url, { redirect: "manual" });
  assert.equal(login.status, 302);
  cookie = login.headers.get("set-cookie").split(";")[0];
});
after(async () => editor && editor.close());

test("requests need the session cookie, an allowed host, and a same-origin JSON body", async () => {
  const anonymous = await fetch(`http://127.0.0.1:${editor.port}/`);
  assert.equal(anonymous.status, 403);
  const badHost = await new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: editor.port, path: "/", headers: { Host: "evil.test", Cookie: cookie } }, resolve);
  });
  assert.equal(badHost.statusCode, 403);
  assert.equal((await call("/api/undo", { method: "POST", body: {}, headers: { Origin: "http://evil.test" } })).status, 403);
  const plain = await call("/api/undo", { method: "POST", headers: { "Content-Type": "text/plain" }, body: undefined });
  assert.equal(plain.status, 415);
  assert.equal((await call("/../../etc/passwd")).status, 404);
});

test("the served page is instrumented but the file is untouched", async () => {
  const page = (await call("/")).text;
  assert.match(page, /data-hre="b1"/);
  assert.match(page, /\/__hre\/overlay\.js/);
  assert.equal(readFileSync(file(), "utf8"), REPORT);
  assert.equal((await call("/__hre/overlay.js")).status, 200);
});

test("an inline edit changes only that block, backs up the original, and rejects stale or mismatched saves", async () => {
  const page = (await call("/")).text;
  const { version } = await state();
  const id = blockId(page, "Sync fails ");
  const ok = await call("/api/edit", { method: "POST", body: { id, version, text: "Sync fails 4% of nights.", html: "Sync fails <strong>4%</strong> of most nights &amp; weekends.<script>x</script>" } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.html, "Sync fails <strong>4%</strong> of most nights &amp; weekends.");
  const saved = readFileSync(file(), "utf8");
  assert.equal(saved, REPORT.replace("Sync fails <strong>4%</strong> of nights.", ok.json.html));
  assert.equal(readdirSync(path.join(dir, "backup")).length, 1);
  const stale = await call("/api/edit", { method: "POST", body: { id, version, text: "x", html: "y" } });
  assert.equal(stale.status, 409);
  const mismatch = await call("/api/edit", { method: "POST", body: { id, version: ok.json.version, text: "something else", html: "y" } });
  assert.equal(mismatch.status, 409);
  assert.equal(readFileSync(file(), "utf8"), saved);
});

test("editing an h2 refreshes the generated table of contents", async () => {
  const page = (await call("/")).text;
  const { version } = await state();
  const result = await call("/api/edit", { method: "POST", body: { id: blockId(page, "Next steps"), version, text: "Next steps", html: "What happens next" } });
  assert.equal(result.json.reload, true);
  assert.match(readFileSync(file(), "utf8"), /<a href="#next">What happens next<\/a>/);
});

test("answers can be typed into empty answer slots", async () => {
  const page = (await call("/")).text;
  const { version } = await state();
  const id = /<p data-hre="(b\d+)" class="answer"><\/p>/.exec(page)[1];
  const result = await call("/api/edit", { method: "POST", body: { id, version, text: "", html: "Yes, retry for 24 hours." } });
  assert.equal(result.status, 200, result.text);
  assert.match(readFileSync(file(), "utf8"), /<p class="answer">Yes, retry for 24 hours\.<\/p>/);
});

test("an AI rewrite protects code, previews a diff, and applies only after accept", async () => {
  const page = (await call("/")).text;
  const { version } = await state();
  const id = scopeId(page, 'class="finding risk" id="f1"');
  calls = [];
  nextRewrite = (fragment) => fragment.replace("Evidence one.", "Evidence one, <strong>confirmed</strong>.");
  const before = readFileSync(file(), "utf8");
  const proposal = await call("/api/ai", { method: "POST", body: { id, version, instruction: "Say it is confirmed." } });
  assert.equal(proposal.status, 200, proposal.text);
  assert.match(calls[0].prompt, /<hr-keep n="1"><\/hr-keep>/);
  assert.doesNotMatch(calls[0].prompt.split("Fragment to rewrite:")[1], /select 1/);
  assert.match(calls[0].prompt, /Instruction: Say it is confirmed\./);
  assert.deepEqual(proposal.json.diff.filter((s) => s.op !== "="), [{ op: "-", text: "one." }, { op: "+", text: "one, confirmed." }]);
  assert.match(proposal.json.html, /<pre><code>select 1;<\/code><\/pre>/);
  assert.equal(readFileSync(file(), "utf8"), before, "nothing is written before accept");
  const applied = await call("/api/apply", { method: "POST", body: { proposalId: proposal.json.proposalId } });
  assert.equal(applied.status, 200);
  assert.equal(readFileSync(file(), "utf8"), before.replace("Evidence one.", "Evidence one, <strong>confirmed</strong>."));
  nextRewrite = null;
});

test("unsafe AI proposals are rejected with a reason", async () => {
  const page = (await call("/")).text;
  const { version } = await state();
  const id = scopeId(page, 'class="finding risk" id="f1"');
  nextRewrite = (fragment) => fragment.replace("</h3>", '</h3><img src=x onerror="alert(1)">');
  const rejected = await call("/api/ai", { method: "POST", body: { id, version, instruction: "x" } });
  assert.equal(rejected.status, 422);
  assert.match(rejected.json.error, /disallowed element <img>/);
  nextRewrite = (fragment) => fragment.replace('<hr-keep n="1"></hr-keep>', "");
  assert.match((await call("/api/ai", { method: "POST", body: { id, version, instruction: "x" } })).json.error, /dropped protected content/);
  nextRewrite = null;
});

test("undo and redo step through saved edits", async () => {
  const before = readFileSync(file(), "utf8");
  const page = (await call("/")).text;
  const { version } = await state();
  await call("/api/edit", { method: "POST", body: { id: blockId(page, "Ship it."), version, text: "Ship it.", html: "Ship it now." } });
  const edited = readFileSync(file(), "utf8");
  assert.equal((await call("/api/undo", { method: "POST", body: {} })).status, 200);
  assert.equal(readFileSync(file(), "utf8"), before);
  assert.equal((await call("/api/redo", { method: "POST", body: {} })).status, 200);
  assert.equal(readFileSync(file(), "utf8"), edited);
  assert.equal((await call("/api/redo", { method: "POST", body: {} })).status, 409);
});

test("changes on disk are detected, announced, and invalidate old versions", async () => {
  const { version } = await state();
  const events = await fetch(`http://127.0.0.1:${editor.port}/api/events`, { headers: { Cookie: cookie } });
  const reader = events.body.getReader();
  await reader.read();
  writeFileSync(file(), readFileSync(file(), "utf8").replace("Ship it now.", "Changed by an agent."));
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /"type":"changed"/);
  await reader.cancel();
  assert.notEqual((await state()).version, version);
  const page = (await call("/")).text;
  assert.equal((await call("/api/edit", { method: "POST", body: { id: blockId(page, "Changed by an agent."), version, text: "Changed by an agent.", html: "x" } })).status, 409);
  assert.equal((await call("/api/undo", { method: "POST", body: {} })).status, 409, "undo history resets after an outside change");
});

test("settings are validated and saved to the config file", async () => {
  const saved = await call("/api/settings", { method: "PUT", body: { provider: "openrouter", model: "gpt-6-sol", effort: "medium" } });
  assert.deepEqual(saved.json.settings, { provider: "openrouter", model: "gpt-6-sol", effort: "medium" });
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "config", "config.json"), "utf8")), saved.json.settings);
  const rejected = await call("/api/settings", { method: "PUT", body: { provider: "evil", model: "x; rm -rf /", effort: "ultra" } });
  assert.deepEqual(rejected.json.settings, saved.json.settings);
});

test("deleting removes whole sections, cards, rows, and paragraphs, and unlinks references to them", async () => {
  const report = buildSource(`<!doctype html>
<html lang="en" data-template="findings">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete test</title>
</head>
<body>
<header class="hero"><h1>Delete test</h1><p class="lede">Lede.</p></header>
<main>
<section id="summary"><h2>At a glance</h2>
  <div class="tiles">
    <div class="tile"><span>Failed</span><b>4%</b></div>
    <div class="tile"><span>Fixed</span><b>2</b></div>
  </div>
  <p>See <a href="#f1">the rate limits</a> and <a href="#next">next steps</a>.</p>
  <ul><li>Only item.</li></ul>
</section>
<section id="findings"><h2>Findings</h2>
  <article class="finding risk" id="f1"><h3>Rate limits</h3><p>Evidence one.</p></article>
  <article class="question" id="q1"><h3>Retry for a day?</h3><p class="rec">Yes.</p><p class="answer"></p></article>
  <div class="table-wrap"><table><thead><tr><th>Check</th></tr></thead><tbody><tr><td>Row one</td></tr><tr><td>Row two</td></tr></tbody></table></div>
</section>
<section id="next"><h2>Next steps</h2><p>Ship it.</p></section>
</main>
</body>
</html>
`).output;
  writeFileSync(file(), report);
  const started = Date.now();
  while (editor.session.source !== report) {
    if (Date.now() - started > 2000) throw new Error("the editor did not pick up the new file");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const remove = async (pattern) => {
    const page = (await call("/")).text;
    const match = new RegExp(`data-hre="([bc]\\d+)"( data-hre-del)?[^>]*>${pattern}`).exec(page);
    assert.ok(match, `element for ${pattern}`);
    return call("/api/delete", { method: "POST", body: { id: match[1], version: (await state()).version } });
  };

  const page = (await call("/")).text;
  assert.match(page, /<header data-hre="c\d+" class="hero">/, "the hero holds the h1, so it is not deletable");
  assert.match(page, /<h2 data-hre="b\d+">Findings/, "section titles are not deletable");
  assert.match(page, /<p data-hre="b\d+" class="answer">/, "answer slots are not deletable");
  assert.match(page, /<article data-hre="c\d+" data-hre-del class="finding risk"/);
  assert.equal((await remove("Findings")).status, 400);
  const stale = await call("/api/delete", { method: "POST", body: { id: /data-hre="(c\d+)" data-hre-del/.exec(page)[1], version: "old" } });
  assert.equal(stale.status, 409);
  assert.equal(readFileSync(file(), "utf8"), report);

  const card = await remove("<h3[^>]*>Rate limits");
  assert.equal(card.status, 200, card.text);
  assert.equal(card.json.unlinked, 1);
  let saved = readFileSync(file(), "utf8");
  assert.equal(saved, report
    .replace('  <article class="finding risk" id="f1"><h3>Rate limits</h3><p>Evidence one.</p></article>\n', "")
    .replace('<a href="#f1">the rate limits</a>', "the rate limits"));

  assert.equal((await remove("Only item\\.")).status, 200);
  saved = readFileSync(file(), "utf8");
  assert.doesNotMatch(saved, /<ul>/, "a list left empty goes with its last item");
  assert.match(saved, /next steps<\/a>\.<\/p>\n<\/section>/);

  assert.equal((await remove("<td[^>]*>Row two")).status, 200);
  assert.match(readFileSync(file(), "utf8"), /<tbody><tr><td>Row one<\/td><\/tr><\/tbody>/);
  assert.equal((await remove("<span>Fixed")).status, 200);
  assert.doesNotMatch(readFileSync(file(), "utf8"), /Fixed/);

  const beforeSection = readFileSync(file(), "utf8");
  const removed = await remove("<h2[^>]*>Next steps");
  assert.equal(removed.status, 200, removed.text);
  saved = readFileSync(file(), "utf8");
  assert.doesNotMatch(saved, /id="next"|href="#next"/, "the section, its TOC entry, and links to it are gone");
  assert.match(saved, /and next steps\.<\/p>/);
  assert.match(saved, /<\/section>\n<\/main>/, "no blank line is left behind");

  assert.equal((await call("/api/undo", { method: "POST", body: {} })).status, 200);
  assert.equal(readFileSync(file(), "utf8"), beforeSection);
});

test("comments pin to any part, survive edits, rewrites, and deletes, and never shift block ids", async () => {
  writeFileSync(file(), REPORT);
  const started = Date.now();
  while (editor.session.source !== REPORT) {
    if (Date.now() - started > 2000) throw new Error("the editor did not pick up the new file");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const page = (await call("/")).text;
  const ids = (html) => [...html.matchAll(/data-hre="([bc]\d+)"/g)].map((m) => m[1]).join(" ");
  const post = async (route, body) => call(`/api/comments/${route}`, { method: "POST", body: { version: (await state()).version, ...body } });

  const added = await post("add", { id: blockId(page, "Ship it."), x: 0.3, y: 0.6, text: "Ship what, exactly?" });
  assert.equal(added.status, 200, added.text);
  assert.equal(added.json.thread, "cm1");
  assert.deepEqual(added.json.comments.map((t) => [t.id, t.status, t.quote, t.pinned, t.x, t.y]), [["cm1", "open", "Ship it.", true, 0.3, 0.6]]);
  assert.match(readFileSync(file(), "utf8"), /<p data-hr-comment="cm1">Ship it\.<\/p>/);
  assert.equal(ids((await call("/")).text), ids(page), "the store and pins never shift block or scope ids");
  assert.equal((await state()).comments.length, 1);
  assert.equal((await state()).author.length > 0, true);

  const finding = await post("add", { id: scopeId(page, 'class="finding risk" id="f1"'), x: 0.9, y: 0.1, text: "Add the query." });
  assert.equal(finding.json.thread, "cm2");
  assert.equal(finding.json.comments[1].quote, "Rate limits");
  assert.equal((await post("reply", { thread: "cm1", text: "The sync worker." })).json.comments[0].entries.length, 2);
  assert.equal((await post("resolve", { thread: "cm1" })).json.comments[0].status, "resolved");
  assert.equal((await post("resolve", { thread: "cm1", resolved: false })).json.comments[0].status, "open");
  assert.equal((await post("reply", { thread: "cm9", text: "x" })).status, 404);
  assert.equal((await post("add", { id: blockId(page, "Ship it."), text: "  " })).status, 400);
  assert.equal((await call("/api/comments/add", { method: "POST", body: { id: blockId(page, "Ship it."), version: "stale", text: "x" } })).status, 409);

  const edited = await call("/api/edit", { method: "POST", body: { id: blockId(page, "Ship it."), version: (await state()).version, text: "Ship it.", html: "Ship the worker." } });
  assert.equal(edited.status, 200, edited.text);
  assert.match(readFileSync(file(), "utf8"), /<p data-hr-comment="cm1">Ship the worker\.<\/p>/, "text edits keep the pin");

  nextRewrite = (fragment) => fragment.replace(/ data-hr-comment="cm2"/, "").replace("Evidence one.", "Evidence one, confirmed.");
  const proposal = await call("/api/ai", { method: "POST", body: { id: scopeId(page, 'class="finding risk" id="f1"'), version: (await state()).version, instruction: "Confirm it." } });
  nextRewrite = null;
  assert.equal(proposal.status, 200, proposal.text);
  await call("/api/apply", { method: "POST", body: { proposalId: proposal.json.proposalId } });
  assert.match(readFileSync(file(), "utf8"), /<article data-hr-comment="cm2" class="finding risk" id="f1">/, "a rewrite that drops a pin gets it back");

  const beforeDelete = readFileSync(file(), "utf8");
  const deleted = await call("/api/delete", { method: "POST", body: { id: scopeId((await call("/")).text, 'id="next"'), version: (await state()).version } });
  assert.equal(deleted.status, 200, deleted.text);
  assert.deepEqual((await state()).comments.map((t) => [t.id, t.pinned]), [["cm1", false], ["cm2", true]], "deleting the commented part detaches its thread");
  assert.equal((await call("/api/undo", { method: "POST", body: {} })).status, 200);
  assert.equal(readFileSync(file(), "utf8"), beforeDelete);
  assert.equal((await state()).comments[0].pinned, true, "undo re-attaches it");

  assert.equal((await post("delete", { thread: "cm1" })).status, 200);
  assert.equal((await post("delete", { thread: "cm2" })).status, 200);
  assert.doesNotMatch(readFileSync(file(), "utf8"), /data-hr-comment/);
});

function fakeCodex() {
  const bin = path.join(dir, "codex");
  writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-codex.mjs")}" "$@"\n`);
  chmodSync(bin, 0o755);
  return bin;
}

test("codex provider passes the pinned flags and parses the schema output", async () => {
  const log = path.join(dir, "codex-log.json");
  process.env.FAKE_CODEX_LOG = log;
  const result = await rewriteWithCodex({ prompt: "Fragment to rewrite:\n<p>Hi</p>", model: "openai/gpt-6-luna", effort: "low", codexBin: fakeCodex() });
  delete process.env.FAKE_CODEX_LOG;
  assert.equal(result.html, "<p>Hi (edited)</p>");
  const { args, prompt } = JSON.parse(readFileSync(log, "utf8"));
  for (const flag of ["--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--output-schema", "--json"]) assert.ok(args.includes(flag), flag);
  assert.deepEqual(args.slice(args.indexOf("-s"), args.indexOf("-s") + 2), ["-s", "read-only"]);
  assert.equal(args[args.indexOf("-m") + 1], "gpt-6-luna");
  assert.ok(args.includes('model_reasoning_effort="low"'));
  assert.match(prompt, /^You edit one fragment/);
});

test("the transcript task passes its own schema and rules to codex and returns the transcript", async () => {
  const log = path.join(dir, "codex-transcript-log.json");
  process.env.FAKE_CODEX_LOG = log;
  const prompt = buildTranscriptPrompt({ title: "Plan", kind: "slide", label: "Cover", index: 1, total: 4, text: "# Recover lost sales" });
  const result = await rewriteWithCodex({ prompt, model: "gpt-6-luna", effort: "low", codexBin: fakeCodex(), task: TASKS.transcript });
  delete process.env.FAKE_CODEX_LOG;
  assert.equal(result.transcript, "Spoken: # Recover lost sales");
  const logged = JSON.parse(readFileSync(log, "utf8"));
  assert.ok(logged.args[logged.args.indexOf("--output-schema") + 1].endsWith("transcript.schema.json"));
  assert.match(logged.prompt, /^You write spoken transcripts of report text/);
  assert.match(logged.prompt, /This part: a slide with its speaker notes "Cover" \(part 1 of 4\)/);
});

test("codex failures: a missing CLI or logged-out CLI is unavailable, other errors surface", async () => {
  await assert.rejects(rewriteWithCodex({ prompt: "x", model: "m", effort: "low", codexBin: path.join(dir, "nope") }), ProviderUnavailable);
  process.env.FAKE_CODEX_MODE = "login";
  await assert.rejects(rewriteWithCodex({ prompt: "x", model: "m", effort: "low", codexBin: fakeCodex() }), ProviderUnavailable);
  process.env.FAKE_CODEX_MODE = "error";
  await assert.rejects(rewriteWithCodex({ prompt: "x", model: "m", effort: "low", codexBin: fakeCodex() }), (error) => !(error instanceof ProviderUnavailable) && /model overloaded/.test(error.message));
  delete process.env.FAKE_CODEX_MODE;
});

test("a logged-out codex falls back to OpenRouter", async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ html: "<p>From OpenRouter</p>" }) } }], usage: { total_tokens: 3 } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { ...process.env };
  Object.assign(process.env, { OPENROUTER_BASE_URL: `http://127.0.0.1:${server.address().port}/api/v1`, OPENROUTER_API_KEY: "test-key", HRE_CODEX_BIN: fakeCodex(), FAKE_CODEX_MODE: "login" });
  try {
    const result = await rewrite({ provider: "codex", model: "gpt-6-luna", effort: "low" }, { prompt: "Fragment to rewrite:\n<p>x</p>" });
    assert.equal(result.html, "<p>From OpenRouter</p>");
    assert.equal(result.provider, "openrouter");
    assert.match(result.fallback, /not logged in/);
    assert.equal(requests[0].url, "/api/v1/chat/completions");
    assert.equal(requests[0].auth, "Bearer test-key");
    assert.equal(requests[0].body.model, "openai/gpt-6-luna");
    assert.deepEqual(requests[0].body.reasoning, { effort: "low" });
    assert.equal(requests[0].body.response_format.type, "json_schema");
  } finally {
    for (const key of ["OPENROUTER_BASE_URL", "OPENROUTER_API_KEY", "HRE_CODEX_BIN", "FAKE_CODEX_MODE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    server.close();
  }
  assert.ok(existsSync(file()));
});
