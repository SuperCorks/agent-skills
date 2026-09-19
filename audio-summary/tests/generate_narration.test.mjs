import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildSummaryRequest,
  main,
  parseArgs,
  parseEnvText
} from "../scripts/generate_narration.mjs";

test("parseArgs defaults to medium thread scope", () => {
  assert.deepEqual(
    parseArgs([
      "--thread",
      "thread.md",
      "--report",
      "report.md",
      "--output",
      "narration.txt"
    ]),
    {
      thread: "thread.md",
      report: "report.md",
      output: "narration.txt",
      mode: "medium",
      scope: "thread",
      openRouterBaseUrl: null,
      envFile: null,
      overwrite: false,
      dryRun: false,
      help: false
    }
  );
});

test("parseArgs rejects the synthesis options that moved to generate-audio", () => {
  const base = ["--thread", "thread.md", "--report", "report.md", "--output", "narration.txt"];
  assert.throws(() => parseArgs([...base, "--speechify-base-url", "http://localhost"]), /Unknown option/);
  assert.throws(() => parseArgs([...base, "--script-output", "script.txt"]), /Unknown option/);
});

test("parseEnvText reads the OpenRouter credential", () => {
  assert.deepEqual(
    parseEnvText(`
# narration provider
OPENROUTER_API_KEY=openrouter-secret
export OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
    `),
    {
      OPENROUTER_API_KEY: "openrouter-secret",
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1"
    }
  );
});

test("buildSummaryRequest sends thread and report to OpenRouter Kimi K3", () => {
  const request = buildSummaryRequest({
    thread: "The user requested a narrated recap.",
    report: "The implementation completed and five tests passed.",
    mode: "detailed",
    scope: "last-pass"
  });

  assert.equal(request.model, "moonshotai/kimi-k3");
  assert.match(request.messages[0].content, /600-900 words/);
  assert.match(request.messages[0].content, /latest completed work pass/);
  assert.match(request.messages[1].content, /visible thread context/i);
  assert.match(request.messages[1].content, /agent detailed report/i);
  assert.match(request.messages[1].content, /five tests passed/);
});

test("main writes Kimi K3's narration and calls no synthesis provider", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "audio-summary-test-"));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const threadPath = path.join(temporaryDirectory, "thread.md");
  const reportPath = path.join(temporaryDirectory, "report.md");
  const outputPath = path.join(temporaryDirectory, "narration.txt");
  await fs.writeFile(threadPath, "User asked for an audio summary.");
  await fs.writeFile(reportPath, "The task completed and validation passed.");

  const requestedUrls = [];
  let openRouterAuthorization = null;
  let openRouterRequest = null;

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requestedUrls.push(request.url);
      if (request.url === "/api/v1/chat/completions") {
        openRouterAuthorization = request.headers.authorization;
        openRouterRequest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            model: "moonshotai/kimi-k3",
            choices: [{ message: { content: "The requested audio summary is complete. Validation passed." } }]
          })
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "openrouter-test-key";
  try {
    await main([
      "--thread",
      threadPath,
      "--report",
      reportPath,
      "--mode",
      "short",
      "--output",
      outputPath,
      "--openrouter-base-url",
      `http://127.0.0.1:${address.port}/api/v1`
    ]);
  } finally {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }

  assert.equal(openRouterAuthorization, "Bearer openrouter-test-key");
  assert.equal(openRouterRequest.model, "moonshotai/kimi-k3");
  assert.deepEqual(requestedUrls, ["/api/v1/chat/completions"]);
  assert.equal(
    await fs.readFile(outputPath, "utf8"),
    "The requested audio summary is complete. Validation passed.\n"
  );
});

test("main requires a .txt output so narration is never mistaken for audio", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "audio-summary-test-"));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  await assert.rejects(
    main(["--thread", "thread.md", "--report", "report.md", "--output", path.join(temporaryDirectory, "summary.mp3")]),
    /--output must use the \.txt extension/
  );
});

test("the script runs when reached through a symlinked path", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "audio-summary-test-"));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const scripts = path.dirname(fileURLToPath(new URL("../scripts/generate_narration.mjs", import.meta.url)));
  const link = path.join(temporaryDirectory, "linked-scripts");
  await fs.symlink(scripts, link);

  const output = execFileSync(process.execPath, [path.join(link, "generate_narration.mjs"), "--help"], {
    encoding: "utf8"
  });
  assert.match(output, /Usage: node generate_narration\.mjs/, "the script exited without running");
});
