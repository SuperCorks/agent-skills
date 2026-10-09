// Read aloud logic shared by the editor page and the Node tests: no DOM or Node APIs.
// Alignment, timings, and progress are ported from t3code's client runtime (alignment.ts,
// timings.ts, controller.ts); ReadAloudSession is its controller turned into a playlist that
// reads one report section or slide after another.

// ----- alignment (t3code alignment.ts) -----
// The voice reads a rewrite of the section, so progress is mapped through the words the
// screen and the transcript share, and only interpolated between them. The look-ahead covers
// a summarized table or code block between two matching sentences, and widens as on-screen
// words go unmatched so a long paraphrase never loses the alignment.
const LOOKAHEAD_WORDS = 150;
const WINDOW_SIZE = 4;

const normalized = (words) => words.flatMap((raw, index) => {
  const word = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return word.length === 0 ? [] : [{ index, word }];
});

/**
 * Pairs on-screen words with where the transcript speaks them: {words: [display index],
 * fractions: [0-1 through the transcript]}. A pair needs three words in a row to match,
 * nearest first, so common words like "of the" never pull the alignment ahead.
 */
export function alignTranscript(displayWords, transcript) {
  const spokenMatches = Array.from(transcript.matchAll(/\S+/g));
  const spoken = normalized(spokenMatches.map((match) => match[0]));
  const shown = normalized(displayWords);
  const words = [];
  const fractions = [];
  let next = 0;
  let lastMatch = 0;
  for (let i = 0; i < shown.length; i++) {
    const limit = Math.min(spoken.length, next + LOOKAHEAD_WORDS + 2 * (i - lastMatch));
    for (let j = next; j < limit; j++) {
      let length = 0;
      while (i + length < shown.length && j + length < spoken.length && shown[i + length].word === spoken[j + length].word) length++;
      if (length >= 3 || (i === 0 && length === shown.length)) {
        for (let k = 0; k < length; k++) {
          words.push(shown[i + k].index);
          fractions.push(spokenMatches[spoken[j + k].index].index / transcript.length);
        }
        next = j + length;
        i += length - 1;
        lastMatch = i;
        break;
      }
    }
  }
  return { words, fractions };
}

/** The on-screen word at `fraction` of the spoken transcript. */
export function wordIndex(totalWords, fraction, alignment) {
  const last = Math.max(0, totalWords - 1);
  const words = alignment?.words ?? [];
  const fractions = alignment?.fractions ?? [];
  let low = 0;
  let high = fractions.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (fractions[mid] <= fraction) low = mid + 1;
    else high = mid;
  }
  const startFraction = low === 0 ? 0 : fractions[low - 1];
  const endFraction = low === fractions.length ? 1 : fractions[low];
  const startWord = low === 0 ? 0 : words[low - 1];
  const endWord = low === words.length ? totalWords : words[low];
  const span = endFraction - startFraction;
  const within = span > 0 ? (fraction - startFraction) / span : 0;
  const index = startWord + within * (endWord - startWord);
  return Math.min(Math.max(Math.floor(index), 0), last);
}

/**
 * The words to highlight at `fraction`: a window of four around the spoken word ({start, end},
 * end exclusive), or null. `rowOf` names the table or chart row a word sits in (null outside
 * one): the voice narrates a row as a sentence, so the window is the whole row while the voice
 * is in it, and a window in prose never spills into a row.
 */
export function wordWindow(totalWords, fraction, alignment, rowOf = () => null) {
  if (totalWords <= 0) return null;
  const center = wordIndex(totalWords, fraction, alignment);
  const row = rowOf(center) ?? null;
  const reach = row === null ? WINDOW_SIZE : totalWords;
  const sameRow = (word) => (rowOf(word) ?? null) === row;
  let first = center;
  while (first > 0 && center - first < reach && sameRow(first - 1)) first--;
  let last = center + 1;
  while (last < totalWords && last - center < reach && sameRow(last)) last++;
  if (row !== null) return { start: first, end: last };
  const start = Math.max(first, Math.min(center - 1, last - WINDOW_SIZE));
  return { start, end: Math.min(last, start + WINDOW_SIZE) };
}

// ----- timings (t3code timings.ts) -----

/** Rebuilds the spoken text from word marks so SSML and rewrites cannot shift offsets. */
export function timeline(marks) {
  if (!Array.isArray(marks)) return null;
  let transcript = "";
  const words = [];
  let previous = -1;
  for (const mark of marks) {
    if (!mark || typeof mark.text !== "string" || !Number.isFinite(mark.start) || !Number.isFinite(mark.end)) return null;
    if (mark.start < previous || mark.end < mark.start) return null;
    if (mark.text.trim().length === 0) continue;
    if (transcript.length > 0) transcript += " ";
    words.push({ start: mark.start, offset: transcript.length });
    transcript += mark.text;
    previous = mark.start;
  }
  if (words.length === 0) return null;
  return { transcript, words };
}

/** Fraction through the timeline's transcript at `position`: holds the last word through pauses, null before the first. */
export function timedFraction(line, position) {
  const { words, transcript } = line;
  let low = 0;
  let high = words.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (words[mid].start <= position) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return null;
  return (words[low - 1].offset + 0.5) / transcript.length;
}

/** Fallback progress until word timings arrive: elapsed over the known or estimated length. */
export function progressFraction({ position, duration, estimatedDuration }) {
  const total = Number.isFinite(duration) && duration > 0 ? duration : estimatedDuration;
  if (!(total > 0)) return null;
  return Math.min(1, Math.max(0, position / total));
}

export const RATES = [1, 1.1, 1.2, 1.5];
/** The speed after `rate` in the quick toggle, wrapping back to normal. */
export const nextRate = (rate) => RATES.find((candidate) => candidate > rate + 1e-9) ?? 1;

// ----- the playlist -----

/**
 * Reads units (report sections or slides) one after another.
 * - player: {play(url, rate, startAt), pause(), resume(), stop(), setRate(rate)}
 * - units(): [{key, kind, label, text()}], re-read on every use so edits and reloads count
 * - prepare(unit, {text, synthesize, signal}) -> {audioUrl, timingsUrl, transcript, estimatedSeconds, cached, script, voice}
 * - loadTimings(url, signal) -> [{text, start, end}]
 * The next unit's transcript is prefetched when a unit starts playing (cheap), and its audio
 * when `prefetchAudioSeconds` or less remain (paid). A prefetch is reused only while its unit's
 * text is unchanged; stale results are dropped by a generation counter.
 */
export class ReadAloudSession {
  constructor({ player, units, prepare, loadTimings, onChange = () => {}, onError = () => {}, onNotice = () => {}, prefetchAudioSeconds = 20, now = () => Date.now() }) {
    Object.assign(this, { player, units, prepare, loadTimings, onChange, onError, onNotice, prefetchAudioSeconds, now });
    this.phase = "idle";
    this.key = null;
    this.pauseReason = null;
    this.rate = 1;
    this.progress = { position: 0, duration: null };
    this.prepared = null;
    this.line = null;
    this.generation = 0;
    this.retried = false;
    this.started = false;
    this.audioPrefetched = false;
    this.preparingSince = null;
    this.prefetches = new Map();
  }

  list() { return this.units(); }
  unit(key) { return this.list().find((unit) => unit.key === key) || null; }
  neighbour(key, step) {
    const list = this.list();
    const index = list.findIndex((unit) => unit.key === key);
    return index < 0 ? null : list[index + step] || null;
  }
  isActive() { return this.phase !== "idle"; }

  snapshot() {
    const list = this.list();
    const index = list.findIndex((unit) => unit.key === this.key);
    return {
      phase: this.phase, key: this.key, index, total: list.length, label: index >= 0 ? list[index].label : "",
      rate: this.rate, pauseReason: this.pauseReason, preparingSince: this.preparingSince,
      script: this.prepared?.script || null, voice: this.prepared?.voice || null, progress: { ...this.progress },
      estimatedSeconds: this.prepared?.estimatedSeconds ?? null
    };
  }
  emit() { this.onChange(this.snapshot()); }

  /** Prepared audio for a unit, sharing an in-flight or finished prefetch while its text is unchanged. */
  prepareCached(unit, { synthesize }) {
    const text = unit.text();
    let entry = this.prefetches.get(unit.key);
    if (entry && entry.text !== text) {
      entry.controller.abort();
      this.prefetches.delete(unit.key);
      entry = null;
    }
    if (entry && (entry.synthesize || !synthesize)) return entry.promise;
    const controller = new AbortController();
    const promise = this.prepare(unit, { text, synthesize, signal: controller.signal });
    promise.catch(() => { if (this.prefetches.get(unit.key)?.promise === promise) this.prefetches.delete(unit.key); });
    this.prefetches.set(unit.key, { text, synthesize, promise, controller });
    return promise;
  }

  async start(key) {
    const unit = this.unit(key);
    if (!unit) return;
    const generation = ++this.generation;
    this.player.stop();
    Object.assign(this, { key, phase: "preparing", pauseReason: null, prepared: null, line: null, retried: false, started: false, audioPrefetched: false, preparingSince: this.now() });
    this.progress = { position: 0, duration: null };
    this.emit();
    let prepared;
    try {
      prepared = await this.prepareCached(unit, { synthesize: true });
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error, unit);
      return;
    }
    if (generation !== this.generation) return;
    this.prefetches.delete(key);
    this.prepared = prepared;
    this.preparingSince = null;
    if (this.pauseReason) this.phase = "paused";
    else this.play(0);
    this.emit();
    this.watchTimings(generation);
    const next = this.neighbour(key, 1);
    if (next) this.prepareCached(next, { synthesize: false }).catch(() => {});
  }

  play(startAt) {
    this.phase = "playing";
    this.pauseReason = null;
    this.started = true;
    this.player.play(this.prepared.audioUrl, this.rate, startAt);
  }

  watchTimings(generation) {
    const prepared = this.prepared;
    if (!prepared?.timingsUrl) return;
    Promise.resolve(this.loadTimings(prepared.timingsUrl)).then((marks) => {
      if (generation !== this.generation) return;
      this.line = timeline(marks);
      this.emit();
    }, () => { /* keep the estimate */ });
  }

  toggle(defaultKey) {
    if (this.phase === "playing") this.pause("user");
    else if (this.phase === "paused" || this.phase === "cued") this.resume();
    else if (this.phase === "preparing") this.stop();
    else if (defaultKey) this.start(defaultKey);
  }

  pause(reason = "user") {
    if (this.phase === "playing") {
      this.player.pause();
      this.phase = "paused";
      this.pauseReason = reason;
      this.emit();
    } else if (this.phase === "preparing") {
      this.pauseReason = reason;
      this.emit();
    }
  }

  resume() {
    if (this.phase === "cued" || (this.phase === "paused" && !this.prepared)) { this.start(this.key); return; }
    if (this.phase !== "paused") return;
    if (this.started) {
      this.player.resume();
      this.phase = "playing";
      this.pauseReason = null;
    } else this.play(0);
    this.emit();
  }

  stop() {
    this.generation++;
    this.player.stop();
    for (const entry of this.prefetches.values()) entry.controller.abort();
    this.prefetches.clear();
    Object.assign(this, { phase: "idle", key: null, pauseReason: null, prepared: null, line: null, preparingSince: null, started: false });
    this.progress = { position: 0, duration: null };
    this.emit();
  }

  /** Show a unit as paused without loading it (after a page reload). */
  cue(key) {
    if (!this.unit(key)) return;
    this.generation++;
    Object.assign(this, { phase: "cued", key, pauseReason: "user", prepared: null, line: null, started: false });
    this.emit();
  }

  step(delta) {
    if (!this.key) return;
    const target = this.neighbour(this.key, delta);
    if (target) this.start(target.key);
    else this.onNotice(delta > 0 ? "This is the last section." : "This is the first section.");
  }
  next() { this.step(1); }
  previous() { this.step(-1); }

  setRate(rate) {
    this.rate = rate;
    this.player.setRate(rate);
    this.emit();
  }

  reportProgress(position, duration) {
    this.progress = { position, duration: Number.isFinite(duration) ? duration : null };
    if (this.phase !== "playing" || this.audioPrefetched || !this.prepared) return;
    const total = this.progress.duration ?? this.prepared.estimatedSeconds;
    if (!(total > 0) || total - position > this.prefetchAudioSeconds) return;
    this.audioPrefetched = true;
    const next = this.neighbour(this.key, 1);
    if (next) this.prepareCached(next, { synthesize: true }).catch(() => {});
  }

  handleEnded() {
    if (this.phase !== "playing") return;
    const next = this.neighbour(this.key, 1);
    if (next) this.start(next.key);
    else {
      this.stop();
      this.onNotice("Finished reading.");
    }
  }

  /** A live stream that fails is retried once from the finished file (Safari refuses some live streams). */
  handleError(error) {
    if (this.phase === "idle" || this.phase === "cued") return;
    const unit = this.unit(this.key);
    if (this.prepared && !this.prepared.cached && !this.retried) {
      this.retried = true;
      const generation = this.generation;
      const at = this.progress.position;
      Promise.resolve(this.loadTimings(this.prepared.timingsUrl)).then((marks) => {
        if (generation !== this.generation) return;
        this.line = timeline(marks);
        this.prepared = { ...this.prepared, cached: true };
        this.play(at);
        this.emit();
      }, (failure) => { if (generation === this.generation) this.fail(failure || error, unit); });
      return;
    }
    this.fail(error, unit);
  }

  fail(error, unit) {
    this.stop();
    this.onError(error, unit);
  }

  /** Fraction through the transcript the voice has reached, or null before the first word. */
  readAlongFraction() {
    if (!this.prepared || this.phase === "preparing") return null;
    if (this.line) return timedFraction(this.line, this.progress.position);
    return progressFraction({ position: this.progress.position, duration: this.progress.duration, estimatedDuration: this.prepared.estimatedSeconds });
  }

  /** The transcript `readAlongFraction` refers to: the timeline's when word marks arrived. */
  transcript() { return this.line?.transcript ?? this.prepared?.transcript ?? null; }
}
