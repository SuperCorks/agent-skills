import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSpeechifyRequest,
  buildSummaryRequest,
  main,
  parseArgs,
  parseEnvText
} from "../scripts/generate_audio.mjs";

test("parseArgs defaults to medium thread scope", () => {
  assert.deepEqual(
    parseArgs([
      "--thread",
      "thread.md",
      "--report",
      "report.md",
      "--output",
      "summary.mp3"
    ]),
    {
      thread: "thread.md",
      report: "report.md",
      output: "summary.mp3",
      scriptOutput: null,
      mode: "medium",
      scope: "thread",
      openRouterBaseUrl: null,
      speechifyBaseUrl: null,
      envFile: null,
      overwrite: false,
      dryRun: false,
      help: false
    }
  );
});

test("parseEnvText reads both provider credentials and the Swipe News profile", () => {
  assert.deepEqual(
    parseEnvText(`
OPENROUTER_API_KEY=openrouter-secret
SPEECHIFY_API_KEY=speechify-secret
SPEECHIFY_VOICE_ID=harper_32
SPEECHIFY_MODEL_ID="simba-english"
SPEECHIFY_VOICE_SPEED=1.1
SPEECHIFY_LANGUAGE='en-US'
    `),
    {
      OPENROUTER_API_KEY: "openrouter-secret",
      SPEECHIFY_API_KEY: "speechify-secret",
      SPEECHIFY_VOICE_ID: "harper_32",
      SPEECHIFY_MODEL_ID: "simba-english",
      SPEECHIFY_VOICE_SPEED: "1.1",
      SPEECHIFY_LANGUAGE: "en-US"
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

test("main generates narration with Kimi K3 and audio with Speechify", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "audio-summary-test-"));
  context.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  const threadPath = path.join(temporaryDirectory, "thread.md");
  const reportPath = path.join(temporaryDirectory, "report.md");
  const outputPath = path.join(temporaryDirectory, "summary.mp3");
  const scriptPath = path.join(temporaryDirectory, "summary.txt");
  await fs.writeFile(threadPath, "User asked for an audio summary.");
  await fs.writeFile(reportPath, "The task completed and validation passed.");

  const expectedAudio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);
  let openRouterAuthorization = null;
  let openRouterRequest = null;
  let speechifyAuthorization = null;
  let speechifyRequest = null;

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (request.url === "/api/v1/chat/completions") {
        openRouterAuthorization = request.headers.authorization;
        openRouterRequest = body;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            model: "moonshotai/kimi-k3",
            choices: [{ message: { content: "The requested audio summary is complete. Validation passed." } }]
          })
        );
        return;
      }
      if (request.url === "/v1/audio/stream") {
        speechifyAuthorization = request.headers.authorization;
        speechifyRequest = body;
        response.writeHead(200, { "content-type": "audio/mpeg" });
        response.end(expectedAudio);
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const environmentNames = [
    "OPENROUTER_API_KEY",
    "SPEECHIFY_API_KEY",
    "SPEECHIFY_VOICE_ID",
    "SPEECHIFY_MODEL_ID",
    "SPEECHIFY_VOICE_SPEED",
    "SPEECHIFY_LANGUAGE"
  ];
  const originalEnvironment = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]])
  );
  Object.assign(process.env, {
    OPENROUTER_API_KEY: "openrouter-test-key",
    SPEECHIFY_API_KEY: "speechify-test-key",
    SPEECHIFY_VOICE_ID: "harper_32",
    SPEECHIFY_MODEL_ID: "simba-english",
    SPEECHIFY_VOICE_SPEED: "1.1",
    SPEECHIFY_LANGUAGE: "en-US"
  });

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
      "--script-output",
      scriptPath,
      "--openrouter-base-url",
      `http://127.0.0.1:${address.port}/api/v1`,
      "--speechify-base-url",
      `http://127.0.0.1:${address.port}`
    ]);
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  assert.equal(openRouterAuthorization, "Bearer openrouter-test-key");
  assert.equal(openRouterRequest.model, "moonshotai/kimi-k3");
  assert.equal(speechifyAuthorization, "Bearer speechify-test-key");
  assert.equal(speechifyRequest.voice_id, "harper_32");
  assert.equal(speechifyRequest.model, "simba-english");
  assert.deepEqual(await fs.readFile(outputPath), expectedAudio);
  assert.equal(
    await fs.readFile(scriptPath, "utf8"),
    "The requested audio summary is complete. Validation passed.\n"
  );
});
