import assert from "node:assert/strict";
import { test } from "node:test";
import { ReadAloudSession, alignTranscript, nextRate, progressFraction, timedFraction, timeline, wordIndex, wordWindow } from "../editor/read-aloud-core.mjs";

// Ported from t3code's timings.test.ts and read-aloud.test.ts.
test("word timings wait through initial silence and hold the spoken word across a pause", () => {
  const marks = [{ text: "Ready?", start: 0.3, end: 0.6 }, { text: "Run", start: 2, end: 2.2 }, { text: "the", start: 2.2, end: 2.3 }, { text: "tests.", start: 2.3, end: 2.6 }];
  const line = timeline(marks);
  const displayed = ["Ready?", "Run", "the", "tests."];
  const alignment = alignTranscript(displayed, line.transcript);
  const indexAt = (position) => wordIndex(displayed.length, timedFraction(line, position), alignment);
  assert.equal(timedFraction(line, 0.1), null);
  assert.equal(indexAt(0.3), 0);
  assert.equal(indexAt(1.99), 0);
  assert.equal(indexAt(2), 1);
  assert.equal(indexAt(2.3), 3);
  assert.equal(indexAt(10), 3);
  assert.equal(indexAt(2.2), 2, "seeking backwards is a fresh lookup");
  assert.equal(timeline([]), null);
  assert.equal(timeline([...marks].reverse()), null);
  assert.equal(timeline([{ text: "wrong", start: 2, end: 1 }]), null);
  assert.equal(timeline("nope"), null);
});

test("alignment anchors short passages and runs of three words only", () => {
  assert.deepEqual(alignTranscript(["All", "done."], "All done.").words, [0, 1]);
  assert.deepEqual(alignTranscript(["Done."], "Done.").words, [0]);
  assert.deepEqual(alignTranscript("Try running the tests again.".split(" "), "Try running the tests again.").words, [0, 1, 2, 3, 4]);
  const transcript = "a summary of the code then one of the ideas";
  const alignment = alignTranscript("one of the ideas".split(" "), transcript);
  assert.deepEqual(alignment.words, [0, 1, 2, 3]);
  assert.equal(alignment.fractions[0], transcript.indexOf("one") / transcript.length);
});

test("the four-word window follows expanded words and keeps rows whole", () => {
  assert.deepEqual(wordWindow(100, 0.23), { start: 22, end: 26 });
  assert.deepEqual(wordWindow(100, 0), { start: 0, end: 4 });
  assert.deepEqual(wordWindow(100, 1), { start: 96, end: 100 });
  assert.deepEqual(wordWindow(3, 0.5), { start: 0, end: 3 });
  assert.equal(wordWindow(0, 0.5), null);
  const rowOf = (word) => (word >= 10 && word < 20 ? Math.floor(word / 5) : null);
  assert.deepEqual(wordWindow(30, 0.4, null, rowOf), { start: 10, end: 15 });
  assert.deepEqual(wordWindow(30, 0.5, null, rowOf), { start: 15, end: 20 });
  assert.deepEqual(wordWindow(30, 0.31, null, rowOf), { start: 6, end: 10 });
  assert.deepEqual(wordWindow(30, 0.7, null, rowOf), { start: 20, end: 24 });
  const shown = "Run vp test run in apps/web/src/components before you push the branch".split(" ");
  const transcript = "Run v p test run in the components folder under apps web source before you push the branch";
  const before = transcript.indexOf("before") / transcript.length;
  assert.notEqual(shown[wordWindow(shown.length, before).start + 1], "before");
  assert.equal(shown[wordWindow(shown.length, before, alignTranscript(shown, transcript)).start + 1], "before");
});

test("progress follows the estimate until the duration is known, and speeds cycle", () => {
  assert.equal(progressFraction({ position: 10, duration: null, estimatedDuration: null }), null);
  assert.equal(progressFraction({ position: 23, duration: null, estimatedDuration: 100 }), 0.23);
  assert.equal(progressFraction({ position: 23, duration: 50, estimatedDuration: 100 }), 0.46);
  assert.equal(progressFraction({ position: 90, duration: null, estimatedDuration: 60 }), 1);
  assert.deepEqual([1, 1.1, 1.2, 1.5].map(nextRate), [1.1, 1.2, 1.5, 1]);
  assert.equal(nextRate(1.15), 1.2);
});

// ----- the playlist -----
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function harness({ fail = null } = {}) {
  const texts = { a: "Alpha section.", b: "Beta section.", c: "Gamma section." };
  const calls = { prepare: [], player: [], errors: [], notices: [], timings: [] };
  const pending = new Map();
  const player = {
    play: (url, rate, at) => calls.player.push(["play", url, rate, at]),
    pause: () => calls.player.push(["pause"]), resume: () => calls.player.push(["resume"]),
    stop: () => calls.player.push(["stop"]), setRate: (rate) => calls.player.push(["rate", rate])
  };
  const session = new ReadAloudSession({
    player,
    units: () => Object.keys(texts).map((key) => ({ key, kind: "section", label: key.toUpperCase(), text: () => texts[key] })),
    prepare: (unit, { text, synthesize }) => {
      calls.prepare.push([unit.key, synthesize, text]);
      if (fail === unit.key) return Promise.reject(new Error(`no ${unit.key}`));
      return new Promise((resolve) => pending.set(`${unit.key}:${calls.prepare.length}`, () => resolve({
        audioUrl: `/audio/${unit.key}.mp3`, timingsUrl: `/audio/${unit.key}.timings.json`, transcript: text, estimatedSeconds: 30, cached: false, script: { model: "m" }, voice: "harper_32"
      })));
    },
    loadTimings: (url) => { calls.timings.push(url); return Promise.resolve([{ text: "Alpha", start: 0.5, end: 1 }, { text: "section.", start: 1, end: 2 }]); },
    onError: (error, unit) => calls.errors.push([error.message, unit?.key]),
    onNotice: (message) => calls.notices.push(message)
  });
  const resolveAll = async () => { for (const [key, resolve] of [...pending]) { pending.delete(key); resolve(); } await tick(); await tick(); };
  return { session, calls, texts, resolveAll, pending };
}

test("a session prepares, plays, prefetches the next script, and buys its audio near the end", async () => {
  const { session, calls, resolveAll } = harness();
  session.start("a");
  assert.equal(session.phase, "preparing");
  await resolveAll();
  assert.equal(session.phase, "playing");
  assert.deepEqual(calls.player.at(-1), ["play", "/audio/a.mp3", 1, 0]);
  assert.deepEqual(calls.prepare, [["a", true, "Alpha section."], ["b", false, "Beta section."]], "the next script is prefetched without audio");
  assert.ok(session.line, "word timings load after play starts");
  assert.equal(session.readAlongFraction(), null, "nothing is highlighted before the first word");
  session.reportProgress(0.6, 40);
  assert.ok(session.readAlongFraction() > 0);
  session.reportProgress(10, 40);
  assert.equal(calls.prepare.length, 2, "no audio is bought while more than 20 s remain");
  session.reportProgress(21, 40);
  session.reportProgress(22, 40);
  assert.deepEqual(calls.prepare.slice(2), [["b", true, "Beta section."]], "the next audio is requested once");
});

test("a session continues to the next unit, reusing prefetches only while the text is unchanged", async () => {
  const { session, calls, texts, resolveAll } = harness();
  session.start("a");
  await resolveAll();
  session.reportProgress(25, 40);
  await resolveAll();
  const before = calls.prepare.length;
  session.handleEnded();
  await resolveAll();
  assert.equal(session.key, "b");
  assert.equal(calls.prepare.length, before + 1, "b reused its prefetched audio; only c's script was prefetched");
  assert.deepEqual(calls.prepare.at(-1), ["c", false, "Gamma section."]);
  texts.c = "Gamma, edited.";
  session.handleEnded();
  await resolveAll();
  assert.deepEqual(calls.prepare.at(-1), ["c", true, "Gamma, edited."], "an edited unit is prepared afresh");
  session.handleEnded();
  assert.equal(session.phase, "idle");
  assert.deepEqual(calls.notices, ["Finished reading."]);
});

test("a session drops late results, keeps its speed, steps, pauses, and cues", async () => {
  const { session, calls, resolveAll } = harness();
  session.setRate(1.2);
  session.start("a");
  session.next();
  await resolveAll();
  assert.equal(session.key, "b");
  assert.deepEqual(calls.player.filter((c) => c[0] === "play").map((c) => c[1]), ["/audio/b.mp3"], "a's late result never plays");
  assert.equal(calls.player.at(-1)[2], 1.2, "the speed carries over");
  session.previous();
  await resolveAll();
  assert.equal(session.key, "a");
  session.previous();
  assert.deepEqual(calls.notices, ["This is the first section."]);
  session.pause("editing");
  assert.equal(session.snapshot().pauseReason, "editing");
  session.toggle();
  assert.equal(session.phase, "playing");
  assert.deepEqual(calls.player.at(-1), ["resume"]);
  session.stop();
  session.cue("c");
  assert.equal(session.phase, "cued");
  session.toggle();
  await resolveAll();
  assert.equal(session.phase, "playing");
  assert.equal(session.key, "c");
});

test("a pause during preparation holds the audio until resumed", async () => {
  const { session, calls, resolveAll } = harness();
  session.start("a");
  session.pause("editing");
  await resolveAll();
  assert.equal(session.phase, "paused");
  assert.equal(calls.player.filter((c) => c[0] === "play").length, 0);
  session.resume();
  assert.deepEqual(calls.player.at(-1), ["play", "/audio/a.mp3", 1, 0]);
});

test("errors stop with the reason, and a failed live stream retries once from the file", async () => {
  const { session, calls, resolveAll } = harness({ fail: "b" });
  session.start("a");
  await resolveAll();
  session.reportProgress(3, null);
  session.handleError(new Error("decode"));
  await resolveAll();
  assert.deepEqual(calls.player.at(-1), ["play", "/audio/a.mp3", 1, 3], "retried from where it stopped");
  session.handleError(new Error("decode again"));
  assert.equal(session.phase, "idle");
  assert.deepEqual(calls.errors, [["decode again", "a"]]);
  session.start("b");
  await resolveAll();
  assert.deepEqual(calls.errors.at(-1), ["no b", "b"]);
  assert.equal(session.phase, "idle");
});
