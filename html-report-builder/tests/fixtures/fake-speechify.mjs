// A local stand-in for Speechify's API: /v1/audio/speech answers the key probe, and
// /v1/audio/stream/with-timestamps streams server-sent events with base64 "audio" and word
// marks at 0.4 s per word of the SSML's text, then speech.done. `mode` switches failures.
import http from "node:http";

const textOf = (ssml) => ssml.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export async function startFakeSpeechify({ delayMs = 0, wordSeconds = 0.4 } = {}) {
  const fake = { mode: 200, streamMode: 200, requests: [], probes: 0, delayMs, url: "" };
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : {};
    fake.requests.push({ path: req.url, headers: req.headers, body: json });
    const fail = (status) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: status === 402 ? "Out of credits until Nov 1." : `Fake failure ${status}` } }));
    };
    if (req.headers.authorization !== "Bearer test-key") return fail(401);
    if (req.url === "/v1/audio/speech") {
      fake.probes++;
      if (fake.mode !== 200) return fail(fake.mode);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ audio_data: Buffer.from("hi").toString("base64"), audio_format: "mp3" }));
    }
    if (req.url !== "/v1/audio/stream/with-timestamps") return fail(404);
    if (fake.streamMode !== 200) return fail(fake.streamMode);
    const words = textOf(json.input || "").split(/\s+/).filter(Boolean);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = async (event, data) => {
      res.write(`event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`);
      if (fake.delayMs) await new Promise((resolve) => setTimeout(resolve, fake.delayMs));
    };
    const half = Math.ceil(words.length / 2);
    const marks = words.map((value, i) => ({ type: "word", value, start_time: Math.round(i * wordSeconds * 1000), end_time: Math.round((i + 0.9) * wordSeconds * 1000) }));
    await send("speech.chunk", { audio: Buffer.from(`[${words.slice(0, half).join(" ")}]`).toString("base64") });
    await send("speech.chunk", { audio: Buffer.from(`[${words.slice(half).join(" ")}]`).toString("base64"), speech_marks: [{ type: "sentence", value: "x", start_time: 0, end_time: 1 }, ...marks] });
    await send("speech.done", { audio_duration_ms: Math.round(words.length * wordSeconds * 1000) });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  return fake;
}
