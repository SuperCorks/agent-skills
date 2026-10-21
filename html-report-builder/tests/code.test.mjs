import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSource } from "../scripts/lib/build.mjs";
import { checkSource } from "../scripts/lib/check.mjs";
import { codeBlocksIn, highlightCode, loadHighlighter } from "../scripts/lib/code.mjs";
import { renderMedia } from "../scripts/lib/media.mjs";
import { readLibrary } from "../scripts/lib/vendor.mjs";

const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code</title>
</head>
<body>
<main>
<h1>Code</h1>
${body}
</main>
</body>
</html>
`;
const SQL = `<pre><code class="language-sql">select * from runs where note = 'a &lt; b';</code></pre>`;

// A stand-in for highlight.js: wraps each word in a keyword span and knows only sql and js.
const fakeHljs = {
  getLanguage: (name) => (["sql", "js"].includes(name) ? { name: name === "sql" ? "SQL" : "JavaScript" } : undefined),
  listLanguages: () => ["js", "sql"],
  highlight: (text) => ({ value: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\b(select|from|where)\b/g, '<span class="hljs-keyword">$1</span>') })
};

test("code blocks are coloured once, labelled, and recoloured only when their text changes", () => {
  const first = highlightCode(page(SQL), { hljs: fakeHljs });
  assert.equal(first.highlighted, 1);
  assert.match(first.source, /<code class="language-sql" data-lang="SQL" data-hr-highlight="[0-9a-f]{16}"><span class="hljs-keyword">select<\/span>/);
  assert.match(first.source, /'a &lt; b'/, "escaped text stays escaped");
  const again = highlightCode(first.source, { hljs: fakeHljs });
  assert.equal(again.highlighted, 0);
  assert.equal(again.source, first.source, "a second build changes nothing");
  // Editing a word inside the coloured spans: the next build reads the plain text back.
  const edited = first.source.replace('<span class="hljs-keyword">from</span> runs', '<span class="hljs-keyword">from</span> jobs');
  const recoloured = highlightCode(edited, { hljs: fakeHljs });
  assert.equal(recoloured.highlighted, 1);
  assert.match(recoloured.source, /<span class="hljs-keyword">from<\/span> jobs/);
  assert.equal((recoloured.source.match(/data-hr-highlight=/g) || []).length, 1, "the hash attribute is replaced, not repeated");
});

test("unknown and plain languages keep escaped text and still get a label", () => {
  const result = highlightCode(page('<pre><code class="language-liquid">{{ product.title }} &amp; more</code></pre>\n<pre><code class="language-text">Built &lt;ok&gt;</code></pre>'), { hljs: fakeHljs });
  assert.match(result.source, /<code class="language-liquid" data-lang="liquid" data-hr-highlight="[0-9a-f]+">\{\{ product\.title \}\} &amp; more<\/code>/);
  assert.match(result.source, /<code class="language-text" data-lang="Text" data-hr-highlight="[0-9a-f]+">Built &lt;ok&gt;<\/code>/);
  assert.deepEqual(result.notes.map((n) => n.split(";")[0]), ['no highlighting for language "liquid"']);
});

test("without highlight.js the build leaves code untouched and says why", () => {
  const source = page(SQL);
  const result = highlightCode(source, { hljs: null });
  assert.equal(result.source, source);
  assert.match(result.notes[0], /highlight\.js is not available/);
  assert.equal(highlightCode(page("<pre><code>plain</code></pre>"), { hljs: null }).notes.length, 0, "blocks without a language need nothing");
});

test("only <pre><code> with a language counts as a code block", () => {
  const blocks = codeBlocksIn(page('<p><code class="language-sql">inline</code></p>\n<pre><code class="lang-JS">x()</code></pre>\n<pre><code>none</code></pre>'));
  assert.deepEqual(blocks.map((b) => b.language), ["js"]);
});

test("check flags uncoloured and unlabelled blocks but not generated classes or code placeholders", () => {
  const warnings = (source) => checkSource(source).warnings.join("\n");
  assert.match(warnings(page(SQL)), /1 code block\(s\) not coloured yet/);
  const coloured = highlightCode(page(SQL), { hljs: fakeHljs }).source;
  assert.doesNotMatch(warnings(coloured), /not coloured|component vocabulary/);
  assert.match(warnings(page("<pre><code>select 1;</code></pre>")), /name no language/);
  const liquid = page('<pre><code class="language-text">{{ product.title }} TODO</code></pre>');
  assert.doesNotMatch(checkSource(liquid).errors.join(), /placeholder/);
  assert.doesNotMatch(warnings(liquid), /TODO/);
  assert.match(checkSource(page("<p>{{ client name }}</p>")).errors.join(), /unfinished placeholder/, "placeholders outside code still fail");
});

test("the build inlines code styles only into reports with code blocks", () => {
  const withCode = buildSource(highlightCode(page(SQL), { hljs: fakeHljs }).source).output;
  assert.match(withCode, /--code-keyword/);
  assert.match(buildSource(page('<figure class="code"><figcaption>a.txt</figcaption><pre><code>x</code></pre></figure>')).output, /--code-keyword/);
  const without = buildSource(page("<p>No code.</p>")).output;
  assert.doesNotMatch(without, /--code-keyword/);
  assert.doesNotMatch(buildSource(withCode.replace(/<pre>[\s\S]*?<\/pre>/, "<p>Removed.</p>")).output, /--code-keyword/, "removing the last block removes the styles");
});

test("renderMedia loads highlight.js only for blocks that need colouring", async () => {
  const loaded = [];
  const never = async () => { throw new Error("no browser needed"); };
  const loadLibrary = async (name) => { loaded.push(name); throw new Error("offline"); };
  await renderMedia(page("<p>No code.</p>"), { runBrowser: never, loadLibrary });
  assert.deepEqual(loaded, []);
  const offline = await renderMedia(page(SQL), { runBrowser: never, loadLibrary });
  assert.deepEqual(loaded, ["highlight"]);
  assert.equal(offline.changed, false);
  assert.ok(offline.notes.some((n) => /offline/.test(n)));
});

const library = readLibrary("highlight");
test("the pinned highlight.js colours SQL, TypeScript, and HTML", { skip: library ? false : "highlight.js is not cached (run a build with a code block once)" }, () => {
  const hljs = loadHighlighter(library);
  const result = highlightCode(page(`${SQL}\n<pre><code class="language-ts">const n: number = 1;</code></pre>\n<pre><code class="language-html">&lt;b class="x"&gt;hi&lt;/b&gt;</code></pre>`), { hljs });
  assert.equal(result.highlighted, 3);
  assert.match(result.source, /data-lang="SQL"[^>]*><span class="hljs-keyword">select<\/span>/);
  assert.match(result.source, /data-lang="TypeScript"/);
  assert.match(result.source, /data-lang="HTML"[^>]*><span class="hljs-tag">&lt;<span class="hljs-name">b<\/span>/);
  assert.deepEqual(checkSource(buildSource(result.source).output).errors, []);
});
