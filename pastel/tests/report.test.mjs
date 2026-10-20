import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assembleRound, escapeHtml, inline, renderReport } from '../scripts/build-report.mjs';

const KNOWN_CLASSES = new Set([
  'hero', 'eyebrow', 'lede', 'meta', 'tiles', 'tile', 'ok', 'warn', 'info', 'risk', 'table-wrap',
  'question', 'rec', 'answer', 'grid', 'card', 'wide', 'pill', 'callout', 'shots', 'chips',
  'compare', 'before', 'after', 'muted', 'checklist',
]);

function round(overrides = {}) {
  return {
    title: 'Guest portal <feedback>',
    audience: 'internal',
    date: 'Oct 20, 2026',
    canvasName: 'Guest account',
    canvasUrl: 'https://usepastel.com/link/abc/',
    version: '2.0',
    links: [{ kind: 'Pull request', label: 'repo#1', url: 'https://github.com/o/r/pull/1' }],
    decisions: [{ question: 'Which list?', answer: 'Akia', by: 'Simon' }],
    next: ['Merge'],
    verification: ['Tests pass'],
    capture: { before: 'staging', after: 'local' },
    warnings: [],
    entries: [
      {
        number: 38, title: 'Badges', outcome: 'changed', change: 'Green `badge`', files: ['a.css'], note: 'n',
        comment: 'Make it <green>', replies: [{ userName: 'Simon', comment: 'Sure' }], author: 'Leslie',
        createdAt: '2026-10-20T10:00:00Z', url: 'https://usepastel.com/link/abc/comment/1/', pageUrl: 'https://x.test/stays?view=upcoming',
        media: [{ label: 'Pastel screenshot', src: 'r.assets/38-pastel.jpg' }],
        before: { src: 'r.assets/38-before.jpg' }, after: null,
      },
      { number: 22, outcome: 'already-done', change: 'Live', comment: 'Hover', media: [], before: null, after: null },
    ],
    ...overrides,
  };
}

test('escapes reviewer text and allows only simple inline markup', () => {
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(inline('Use `x` and **y** [PR](https://e.com/1)'), 'Use <code>x</code> and <strong>y</strong> <a href="https://e.com/1">PR</a>');
  assert.equal(inline('[bad](javascript:alert(1))'), '[bad](javascript:alert(1))');
});

test('renders a findings report with stable ids and only builder classes', () => {
  const html = renderReport(round());
  assert.match(html, /data-template="findings" data-audience="internal" data-kernel-kind="report"/);
  assert.match(html, /<article class="card wide" id="c38">/);
  assert.match(html, /<article class="question" id="q1">/);
  assert.match(html, /<section id="findings" data-toc="Comments">/);
  assert.match(html, /Make it &lt;green&gt;/);
  assert.match(html, /No after screenshot\./);
  assert.match(html, /<td class="info">Already done<\/td>/);
  assert.doesNotMatch(html, /<style|style="/);
  for (const [, classes] of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of classes.split(/\s+/).filter(Boolean)) {
      assert.ok(KNOWN_CLASSES.has(name), `unknown class ${name}`);
    }
  }
});

test('a client report drops internal detail', () => {
  const html = renderReport(round({ audience: 'client' }));
  assert.match(html, /data-audience="client"/);
  assert.doesNotMatch(html, /a\.css|repo#1|Tests pass/);
});

test('assembles a round from a review folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastel-report-'));
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data));
  };
  write('comments.json', { comments: [{ number: 5, comment: 'Bigger logo', userName: 'leslie', fullCommentUrl: 'https://p/5', status: 'active' }] });
  write('media/media.json', { media: { 5: [{ kind: 'pastel-screenshot', label: 'Pastel screenshot', file: '5-pastel.jpg' }] } });
  write('media/5-pastel.jpg', 'jpeg');
  write('before/capture.json', { label: 'before', capturedAt: '2026-10-20T10:00:00Z', results: [{ number: 5, file: '5.jpg', located: 'pastel-selector' }] });
  write('before/5.jpg', 'jpeg');
  write('after/capture.json', { label: 'after', results: [{ number: 5, file: '5.jpg', located: 'recorded-position', warning: 'Selector did not match' }] });
  write('after/5.jpg', 'jpeg');
  write('changes.json', { title: 'Round', reviewer: 'Leslie Primack', comments: [{ number: 5, outcome: 'changed', change: 'Logo is 112px' }] });

  const out = path.join(dir, 'out', 'round.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const assembled = assembleRound(dir, out);
  const [entry] = assembled.entries;
  assert.equal(entry.author, 'Leslie Primack');
  assert.equal(entry.status, null);
  assert.equal(entry.before.src, 'round.assets/5-before.jpg');
  assert.equal(entry.after.src, 'round.assets/5-after.jpg');
  assert.equal(entry.media[0].src, 'round.assets/5-pastel.jpg');
  assert.deepEqual(assembled.warnings, ['#5 after: Selector did not match']);
  assert.ok(fs.existsSync(path.join(dir, 'out', 'round.assets', '5-before.jpg')));
});
