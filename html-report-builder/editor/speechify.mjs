// Speechify's REST API as read aloud uses it, ported from t3code (speechifyApi.ts and
// transcriptChunks.ts). Audio streams as server-sent events with word timestamps on the same
// clock; a key is checked by spending two characters on "Hi".
export const SPEECHIFY_MODEL = "simba-3.2";
export const DEFAULT_VOICE = "harper_32";
export const SSML_VERSION = "ssml-breaks-v1";
export const SPOKEN_CHARS_PER_SECOND = 15.4;
const LANGUAGE = "en-US";

const FALLBACK_DETAIL = {
  "invalid-key": "Speechify rejected the API key.",
  "insufficient-credits": "Speechify has no credits left for this API key.",
  unavailable: "Speechify is unavailable right now."
};

export class SpeechifyError extends Error {
  constructor(kind, detail) {
    super(detail || FALLBACK_DETAIL[kind] || FALLBACK_DETAIL.unavailable);
    this.kind = kind;
    this.detail = this.message;
  }
}

export function speechifyFailureKind(status) {
  if (status === 401 || status === 403) return "invalid-key";
  if (status === 402) return "insufficient-credits";
  return "unavailable";
}

async function failFromResponse(response) {
  const body = await response.text().catch(() => "");
  let message;
  try { message = JSON.parse(body)?.error?.message; } catch { /* not JSON */ }
  const kind = speechifyFailureKind(response.status);
  return new SpeechifyError(kind, typeof message === "string" && message ? message : FALLBACK_DETAIL[kind]);
}

const escapeSsml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Wraps plain transcript text in SSML, turning line breaks into short pauses. */
export function transcriptToSsml(text) {
  const body = escapeSsml(text.trim())
    .replace(/\n{2,}/g, '<break strength="weak" />')
    .replace(/\n/g, '<break time="250ms" />');
  return `<speak>${body}</speak>`;
}

/**
 * Splits a transcript into pieces Speechify accepts in one streaming request. Cuts land on
 * paragraph breaks, then sentence ends, then spaces, never before `minChars` unless no
 * boundary exists.
 */
export function splitTranscript(transcript, maxChars, minChars = maxChars / 2) {
  const chunks = [];
  let rest = transcript.trim();
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = lastBoundary(window, /\n\s*\n/g, minChars) ?? lastBoundary(window, /[.!?]["')\]]?\s/g, minChars) ?? lastBoundary(window, /\s/g, minChars) ?? maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks.filter((chunk) => chunk.length > 0);
}

function lastBoundary(window, pattern, minChars) {
  let end;
  for (const match of window.matchAll(pattern)) {
    const matchEnd = match.index + match[0].length;
    if (matchEnd >= minChars) end = matchEnd;
  }
  return end;
}

/** Server-sent events from a fetch body: {event, data} per blank-line-terminated block. */
export async function* parseSse(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data = [];
  const flush = function* (line) {
    if (line === "") {
      if (data.length) yield { event, data: data.join("\n") };
      event = "message";
      data = [];
    } else if (line.startsWith(":")) {
      /* comment */
    } else {
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
  };
  for await (const chunk of body) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.search(/\r\n|\r|\n/)) >= 0) {
      // A CR at the end of the buffer may be half of a CRLF still in flight.
      if (buffer[newline] === "\r" && newline === buffer.length - 1) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + (buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1));
      yield* flush(line);
    }
  }
  buffer += decoder.decode();
  if (buffer) yield* flush(buffer);
  yield* flush("");
}

const speechBody = (voice, input) => ({ input, voice_id: voice, model: SPEECHIFY_MODEL, language: LANGUAGE });
const withTimeout = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

async function post(fetchImpl, url, apiKey, body, { signal, accept, timeoutMs }) {
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(accept ? { Accept: accept } : {}) },
      body: JSON.stringify(body),
      signal: withTimeout(signal, timeoutMs)
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SpeechifyError("unavailable");
  }
}

/** Spends two characters to learn whether the key can still synthesize. */
export async function probe({ apiKey, voice = DEFAULT_VOICE, baseUrl = "https://api.speechify.ai", fetch: fetchImpl = globalThis.fetch, signal }) {
  const response = await post(fetchImpl, `${baseUrl}/v1/audio/speech`, apiKey, { ...speechBody(voice, "Hi"), audio_format: "mp3" }, { signal, timeoutMs: 20_000 });
  if (!response.ok) throw await failFromResponse(response);
  await response.arrayBuffer().catch(() => null);
}

/**
 * Streams one request's audio and word marks: yields {audio?: Buffer, marks?: [{text, start,
 * end}] (seconds), duration?}. Marks may arrive after their audio. Fails as "unavailable" if
 * the stream errors or ends without speech.done.
 */
export async function* streamSpeech({ apiKey, voice = DEFAULT_VOICE, input, baseUrl = "https://api.speechify.ai", fetch: fetchImpl = globalThis.fetch, signal }) {
  const response = await post(fetchImpl, `${baseUrl}/v1/audio/stream/with-timestamps`, apiKey, { ...speechBody(voice, input), output_format: "mp3_24000_64" }, { signal, accept: "text/event-stream", timeoutMs: 30_000 });
  if (!response.ok) throw await failFromResponse(response);
  let done = false;
  try {
    for await (const { event, data } of parseSse(response.body)) {
      if (event === "speech.error") throw new SpeechifyError("unavailable");
      if (event === "speech.done") {
        const body = JSON.parse(data);
        if (!Number.isFinite(body.audio_duration_ms)) throw new SpeechifyError("unavailable");
        done = true;
        yield { duration: body.audio_duration_ms / 1000 };
        continue;
      }
      if (event !== "speech.chunk" || done) continue;
      const body = JSON.parse(data);
      const marks = (body.speech_marks || [])
        .filter((mark) => mark.type === "word" && Number.isFinite(mark.start_time) && Number.isFinite(mark.end_time))
        .map((mark) => ({ text: String(mark.value), start: mark.start_time / 1000, end: mark.end_time / 1000 }));
      yield { ...(typeof body.audio === "string" ? { audio: Buffer.from(body.audio, "base64") } : {}), marks };
    }
  } catch (error) {
    if (signal?.aborted || error instanceof SpeechifyError) throw error;
    throw new SpeechifyError("unavailable");
  }
  if (!done) throw new SpeechifyError("unavailable");
}
