#!/usr/bin/env node
// gdoc: deliver a report as a Google Doc and keep working in the Doc. `create` writes a built
// report into a new Doc (the Doc is the source from then on), `outline` reads it with handles,
// comments, and suggestions, `edit` applies semantic operations (as suggestions by default),
// `share` adds people, and `snapshot` exports a copy. Google calls go through `gws`, as the
// `--account` alias via `gswitch run` when one is given.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brandStyleIn, brandTheme, loadBrandFile } from "./lib/brand.mjs";
import { buildSource, decodeDataUri } from "./lib/build.mjs";
import { checkSource } from "./lib/check.mjs";
import { convertReport, makePalette } from "./lib/gdoc-blocks.mjs";
import { OPS, EditError, planEdits, prepareOps } from "./lib/gdoc-edit.mjs";
import { chunkRequests, emitBlocks, fontFamily, namedStyleRequests } from "./lib/gdoc-emit.mjs";
import { docIdFrom, docUrl, formatOutline, readDocument } from "./lib/gdoc-read.mjs";
import { GwsError, docs, drive } from "./lib/gws.mjs";
import { hostImages } from "./lib/image-host.mjs";
import { renderMedia } from "./lib/media.mjs";
import { printableSource } from "./lib/pdf.mjs";
import { rasterize } from "./lib/raster.mjs";
import { attr, classes, parse } from "./lib/scan.mjs";
import { CACHE_DIR } from "./lib/vendor.mjs";
import { isEntrypoint } from "./report.mjs";

const USAGE = `Usage:
  gdoc.mjs create <report.html> [--account <alias>] [--folder <id>] [--title "…"] [--brand kit.json|none] [--again] [--dry-run]
  gdoc.mjs outline <doc> [--section <id>] [--full] [--json] [--account <alias>]
  gdoc.mjs edit <doc> --ops <ops.json|-> [--revision <id>] [--direct] [--outbound] [--dry-run] [--account <alias>]
  gdoc.mjs share <doc> --to a@x.com,b@y.com [--role writer|commenter|reader] [--notify [--message "…"]] [--account <alias>]
  gdoc.mjs snapshot <doc> --out <file.pdf|.docx|.md|.txt> [--account <alias>]

<doc> is a Doc URL or id, or a report whose <report>.gdoc.json (written by create) names the Doc.
--account is a gswitch alias (for example sim or rk); it is remembered in the sidecar.
edit operations (JSON array): ${OPS.join(", ")}; see references/google-docs.md.`;

const EXPORTS = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".md": "text/markdown", ".txt": "text/plain" };

export const sidecarPath = (report) => report.replace(/\.html?$/i, "") + ".gdoc.json";
const cacheDir = (docId) => path.join(process.env.HRB_CACHE_DIR || CACHE_DIR, "gdoc", docId);

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/** The Doc and account a command works on, from a URL/id or a report's sidecar. */
export function locate(target, account) {
  let sidecar = null;
  let sidecarFile = null;
  if (/\.(html?|gdoc\.json)$/i.test(target || "")) {
    sidecarFile = /\.gdoc\.json$/i.test(target) ? path.resolve(target) : sidecarPath(path.resolve(target));
    sidecar = readJson(sidecarFile);
    if (!sidecar?.docId) throw new Error(`${target} has no Google Doc yet (no ${path.basename(sidecarFile)}); run gdoc.mjs create first`);
  }
  const docId = sidecar ? sidecar.docId : docIdFrom(target);
  if (!docId) throw new Error(`${target} is not a Google Doc URL or id`);
  const cached = readJson(path.join(cacheDir(docId), "doc.json")) || {};
  return { docId, account: account || sidecar?.account || cached.account || process.env.GDOC_ACCOUNT || undefined, sidecar, sidecarFile, cached };
}

function rememberDoc(docId, values) {
  mkdirSync(cacheDir(docId), { recursive: true });
  const file = path.join(cacheDir(docId), "doc.json");
  writeFileSync(file, JSON.stringify({ ...(readJson(file) || {}), ...values }, null, 2));
}

function cacheRevision(json) {
  mkdirSync(cacheDir(json.documentId), { recursive: true });
  writeFileSync(path.join(cacheDir(json.documentId), `${json.revisionId}.rev.json`), JSON.stringify({ readAt: new Date().toISOString(), json }));
}

function cachedRevision(docId, revision) {
  const dir = cacheDir(docId);
  if (!existsSync(dir)) return null;
  if (revision) return readJson(path.join(dir, `${revision}.rev.json`));
  const files = readdirSync(dir).filter((f) => f.endsWith(".rev.json")).map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return files.length ? readJson(path.join(dir, files[0].f)) : null;
}

/** Palette and fonts: a brand kit's light colours and font stacks, or the report defaults. */
export function themeFrom(css) {
  const theme = brandTheme(css);
  return {
    palette: makePalette(theme),
    fonts: { body: fontFamily(theme?.font?.body), heading: fontFamily(theme?.font?.heading), mono: fontFamily(theme?.font?.mono) },
    branded: Boolean(theme),
  };
}

/**
 * Report HTML -> the printable source the Doc is written from: built in memory (ids, runtime,
 * chart snapshots, diagrams), review comments stripped, relative images resolving to `dir`.
 */
export async function prepareSource(raw, { file, dir, brand, notes }) {
  const media = await renderMedia(raw, { brand });
  notes.push(...media.notes);
  const built = buildSource(media.source, { file, brand });
  notes.push(...built.notes);
  return printableSource(built.output, { baseHref: pathToFileURL(dir + path.sep).href }).source;
}

function imageReader(dir) {
  return (src) => {
    if (!src) return null;
    if (src.startsWith("data:")) { const decoded = decodeDataUri(src); return decoded ? { bytes: decoded.bytes, mime: decoded.mime } : null; }
    if (/^[a-z]+:/i.test(src)) return null;
    const target = path.resolve(dir, decodeURI(src.split(/[?#]/)[0]));
    if (!existsSync(target)) return null;
    const ext = path.extname(target).toLowerCase();
    const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" }[ext];
    return mime ? { bytes: readFileSync(target), mime } : null;
  };
}

function brandLogo(source, brand) {
  if (brand?.logos?.light) return decodeDataUri(brand.logos.light);
  if (brand === null) return null;
  const doc = parse(source);
  const holder = doc.elements.find((e) => classes(e).some((c) => c === "brand-logo" || c === "brand-logo-light"));
  const img = holder && doc.elements.find((e) => e.name === "img" && e.start >= holder.start && e.end <= holder.end);
  const decoded = img ? decodeDataUri(attr(img, "src") || "") : null;
  return decoded && ["image/png", "image/jpeg", "image/gif"].includes(decoded.mime) ? decoded : null;
}

let shotCounter = 0;
const shotKey = () => `shot${++shotCounter}`;

// ---------------- commands ----------------

async function create(file, opts, out) {
  const target = path.resolve(file);
  const sidecarFile = sidecarPath(target);
  const existing = readJson(sidecarFile);
  if (existing?.docId && !opts.again) throw new Error(`${file} was handed over to Google Docs on ${existing.createdAt?.slice(0, 10)}: ${existing.url}\nWork in that Doc with gdoc.mjs outline/edit, or pass --again to create another Doc.`);
  const raw = readFileSync(target, "utf8");
  const checked = checkSource(raw, { file: target });
  if (checked.errors.length) throw new Error(`fix the report first:\n${checked.errors.map((e) => `  ERROR: ${e}`).join("\n")}`);
  const brand = opts.brand === undefined ? undefined : opts.brand === "none" ? null : loadBrandFile(path.resolve(opts.brand));
  const notes = [];
  const dir = path.dirname(target);
  const source = await prepareSource(raw, { file: target, dir, brand, notes });
  const doc = parse(source);
  const style = brandStyleIn(doc);
  const theme = themeFrom(brand ? brand.stylesheet : brand === null ? null : style ? source.slice(style.innerStart, style.innerEnd) : null);
  const converted = convertReport(source, { palette: theme.palette, shotId: shotKey, imageBytes: imageReader(dir) });
  notes.push(...converted.notes);
  const shots = await rasterize(source, converted.shots);
  notes.push(...shots.notes);
  const images = new Map([...converted.images, ...shots.images]);
  const logo = brandLogo(source, brand);
  if (logo) images.set("logo", logo);
  const title = opts.title || converted.title;
  if (opts.dryRun) {
    const placeholder = new Map([...images.keys()].map((k) => [k, { uri: `https://example.invalid/${k}.png`, width: 300 }]));
    const emitted = emitBlocks(converted.blocks, { cursor: 1, images: placeholder, palette: theme.palette, fonts: theme.fonts });
    out(`Dry run: "${title}" → ${converted.blocks.length} blocks, ${emitted.requests.length} requests, ${emitted.ranges.length} named ranges, ${images.size} images (${converted.shots.length} drawn).`);
    for (const note of [...new Set(notes)]) out(`NOTE: ${note}`);
    return 0;
  }
  const account = opts.account || process.env.GDOC_ACCOUNT;
  if (!account) throw new Error("create needs --account <gswitch alias> (or GDOC_ACCOUNT): the Doc lives in that Google account, so choose it on purpose");
  const created = drive.createDoc(account, { name: title, folder: opts.folder });
  const docId = created.id;
  out(`Created ${docUrl(docId)}`);
  const hosted = hostImages(images, { account });
  try {
    const content = emitBlocks(converted.blocks, { cursor: 1, images: hosted.uris, palette: theme.palette, fonts: theme.fonts });
    const requests = [
      ...(theme.branded ? namedStyleRequests(theme.palette, theme.fonts) : []),
      ...content.requests,
      ...content.ranges.map((r) => ({ createNamedRange: { name: r.name, range: { startIndex: r.start, endIndex: r.end } } })),
    ];
    let revision = null;
    for (const batch of chunkRequests(requests)) {
      const response = docs.batch(account, docId, batch, revision ? { requiredRevisionId: revision } : undefined);
      revision = response.writeControl?.requiredRevisionId || null;
    }
    // Second pass: links to sections (heading ids exist only now) and the logo in the header.
    const written = docs.get(account, docId);
    const model = readDocument(written);
    const follow = [];
    for (const link of content.links) {
      const range = model.ranges[`k_${link.anchor}`];
      const head = range && model.paragraphs.find((p) => p.start === range.start && p.headingId);
      if (head) follow.push({ updateTextStyle: { range: { startIndex: link.start, endIndex: link.end }, textStyle: { link: { heading: { id: head.headingId, ...(model.tabId ? { tabId: model.tabId } : {}) } }, foregroundColor: { color: { rgbColor: hexToRgb(theme.palette.accent) } } }, fields: "link,foregroundColor" } });
    }
    if (follow.length) docs.batch(account, docId, follow, { targetRevisionId: written.revisionId });
    if (hosted.uris.has("logo")) {
      const header = docs.batch(account, docId, [{ createHeader: { type: "DEFAULT" } }]);
      const headerId = header.replies?.[0]?.createHeader?.headerId;
      if (headerId) docs.batch(account, docId, [{ insertInlineImage: { location: { segmentId: headerId, index: 0 }, uri: hosted.uris.get("logo").uri, objectSize: { height: { magnitude: 22, unit: "PT" } } } }]);
    }
  } finally {
    try { hosted.cleanup(); } catch (error) { notes.push(error.message); }
  }
  const record = { source: "google-doc", docId, url: docUrl(docId), account: account || null, title, report: path.basename(target), createdAt: new Date().toISOString() };
  writeFileSync(sidecarFile, `${JSON.stringify(record, null, 2)}\n`);
  rememberDoc(docId, { account: account || null, palette: Object.fromEntries(Object.entries(theme.palette).filter(([, v]) => typeof v === "string")), fonts: theme.fonts });
  out(`Wrote ${path.basename(sidecarFile)}: the Doc is now the source. Edit it with gdoc.mjs outline/edit, not the HTML.`);
  out(`It is not shared yet: gdoc.mjs share ${path.relative(process.cwd(), target)} --to <emails> (no notification email unless --notify).`);
  for (const note of [...new Set(notes)]) out(`NOTE: ${note}`);
  return 0;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  return m ? { red: parseInt(m[1].slice(0, 2), 16) / 255, green: parseInt(m[1].slice(2, 4), 16) / 255, blue: parseInt(m[1].slice(4, 6), 16) / 255 } : {};
}

function outline(target, opts, out) {
  const { docId, account } = locate(target, opts.account);
  const json = docs.get(account, docId);
  cacheRevision(json);
  rememberDoc(docId, { account: account || null });
  const model = readDocument(json);
  if (opts.json) { out(JSON.stringify(model, null, 2)); return 0; }
  out(formatOutline(model, { section: opts.section || null, full: opts.full }));
  out("");
  out(`Edit against this revision: gdoc.mjs edit ${target} --revision ${json.revisionId} --ops ops.json`);
  return 0;
}

async function edit(target, opts, out) {
  const { docId, account, cached, sidecar, sidecarFile } = locate(target, opts.account);
  if (!opts.ops) throw new Error("edit needs --ops <file.json> (or - for stdin)");
  const ops = JSON.parse(opts.ops === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(opts.ops), "utf8"));
  const entry = cachedRevision(docId, opts.revision);
  if (!entry) throw new Error(`no cached read of ${opts.revision ? `revision ${opts.revision}` : "this Doc"}; run gdoc.mjs outline ${target} first`);
  const age = Date.now() - Date.parse(entry.readAt);
  if (age > 23 * 3600 * 1000) throw new Error(`revision ${entry.json.revisionId} was read more than 23 hours ago (Google accepts revisions for 24); run gdoc.mjs outline again`);
  const model = readDocument(entry.json);
  const palette = makePalette(cached.palette ? { light: cached.palette } : null);
  const fonts = cached.fonts || {};
  const notes = [];
  // Fragments are built like reports so components, charts, and mockups look the same.
  const fragments = new Map();
  for (const op of Array.isArray(ops) ? ops : []) {
    const html = op.op === "set-paragraph" && op.html !== undefined ? `<p>${op.html}</p>` : op.html;
    if (typeof html === "string" && !fragments.has(html)) {
      const wrapped = `<!doctype html>\n<html lang="en" data-template="brief" data-audience="client">\n<head>\n<meta charset="utf-8">\n<title>Fragment</title>\n</head>\n<body>\n<main>\n${html}\n</main>\n</body>\n</html>\n`;
      fragments.set(html, { source: await prepareSource(wrapped, { file: path.join(process.cwd(), "fragment.html"), dir: process.cwd(), notes }) });
    }
  }
  const prepared = prepareOps(model, ops, {
    convert: (html) => {
      const fragment = fragments.get(html);
      const converted = convertReport(fragment.source, { fragment: true, palette, shotId: shotKey, imageBytes: imageReader(process.cwd()) });
      fragment.shots = [...(fragment.shots || []), ...converted.shots];
      return converted;
    },
  });
  notes.push(...prepared.notes);
  if (prepared.outbound && !opts.outbound) throw new EditError("these operations post comments or replies the client will see (and Google emails them); run again with --outbound only when the user has asked to send them");
  const images = new Map(prepared.images);
  for (const fragment of fragments.values()) {
    const drawn = await rasterize(fragment.source, fragment.shots || []);
    notes.push(...drawn.notes);
    for (const [k, v] of drawn.images) images.set(k, v);
  }
  for (const op of prepared.prepared.filter((o) => o.op === "replace-image")) {
    const file = path.resolve(op.png || op.file || "");
    const reader = imageReader(path.dirname(file))(path.basename(file));
    if (!reader) throw new EditError(`replace-image: ${op.png || op.file} is not a PNG, JPEG, or GIF file`);
    op.imageKey = `replace${op.n}`;
    images.set(op.imageKey, reader);
  }
  const suggest = !opts.direct;
  const placeholder = new Map([...images.keys()].map((k) => [k, { uri: `https://example.invalid/${k}.png`, width: 300 }]));
  if (opts.dryRun) {
    const plan = planEdits(model, prepared.prepared, { suggest, images: placeholder, palette, fonts });
    out(`Dry run against ${model.revisionId} (${suggest ? "as suggestions" : "direct edits"}):`);
    for (const line of plan.summary) out(`  - ${line}`);
    out(JSON.stringify({ content: plan.content, after: plan.after }, null, 2));
    for (const note of [...new Set([...notes, ...plan.notes])]) out(`NOTE: ${note}`);
    return 0;
  }
  const hosted = hostImages(images, { account });
  let revision;
  let plan;
  try {
    plan = planEdits(model, prepared.prepared, { suggest, images: hosted.uris, palette, fonts });
    if (!suggest) {
      const requests = [...plan.content, ...plan.after];
      if (requests.length) revision = docs.batch(account, docId, requests, { targetRevisionId: model.revisionId }).writeControl?.requiredRevisionId;
    } else {
      let base = model.revisionId;
      if (plan.content.length) base = docs.batch(account, docId, plan.content, { targetRevisionId: model.revisionId, writeMode: "SUGGEST" }).writeControl?.requiredRevisionId || base;
      if (plan.after.length) {
        try {
          base = docs.batch(account, docId, plan.after, { targetRevisionId: base }).writeControl?.requiredRevisionId || base;
        } catch (error) {
          if (!plan.content.length) throw error;
          throw new GwsError(`the suggestions went in, but the follow-up (named ranges, comments, replies, accept/reject) failed: ${error.message}. Run gdoc.mjs outline and redo only those parts.`);
        }
      }
      revision = base;
    }
  } finally {
    try { hosted.cleanup(); } catch (error) { notes.push(error.message); }
  }
  out(`${suggest ? "Suggested" : "Applied"} in ${docUrl(docId)}${revision ? ` (now revision ${revision})` : ""}:`);
  for (const line of plan.summary) out(`  - ${line}`);
  for (const note of [...new Set([...notes, ...plan.notes])]) out(`NOTE: ${note}`);
  out("Handles change with every edit: run gdoc.mjs outline again before the next one.");
  if (sidecar && sidecarFile) writeFileSync(sidecarFile, `${JSON.stringify({ ...sidecar, lastEditAt: new Date().toISOString() }, null, 2)}\n`);
  return 0;
}

function share(target, opts, out) {
  const { docId, account } = locate(target, opts.account);
  const emails = String(opts.to || "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!emails.length) throw new Error("share needs --to with one or more email addresses");
  const role = opts.role || "writer";
  if (!["writer", "commenter", "reader"].includes(role)) throw new Error("--role is writer, commenter, or reader");
  for (const email of emails) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`${email} is not an email address`);
    drive.share(account, docId, { role, type: "user", emailAddress: email }, { notify: Boolean(opts.notify), message: opts.message });
    out(`Shared with ${email} as ${role === "writer" ? "editor" : role}${opts.notify ? " (Google emailed them)" : " (no email sent)"}`);
  }
  out(docUrl(docId));
  return 0;
}

function snapshot(target, opts, out) {
  const { docId, account } = locate(target, opts.account);
  if (!opts.out) throw new Error("snapshot needs --out <file.pdf|.docx|.md|.txt>");
  const file = path.resolve(opts.out);
  const mime = EXPORTS[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`--out must end in ${Object.keys(EXPORTS).join(", ")}`);
  mkdirSync(path.dirname(file), { recursive: true });
  drive.exportTo(account, path.dirname(file), docId, mime, path.basename(file));
  out(`Wrote ${file}`);
  return 0;
}

// ---------------- CLI ----------------

export function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  const opts = {};
  const flags = { "--json": "json", "--full": "full", "--direct": "direct", "--outbound": "outbound", "--dry-run": "dryRun", "--notify": "notify", "--again": "again" };
  const values = { "--account": "account", "--folder": "folder", "--title": "title", "--brand": "brand", "--section": "section", "--ops": "ops", "--revision": "revision", "--to": "to", "--role": "role", "--message": "message", "--out": "out" };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (flags[arg]) opts[flags[arg]] = true;
    else if (values[arg]) {
      const value = rest[i + 1];
      if (value === undefined || (value.startsWith("--") && value !== "-")) throw new Error(`${arg} needs a value`);
      opts[values[arg]] = value;
      i++;
    } else throw new Error(`unknown option ${arg}`);
  }
  return { command, target, opts };
}

export async function main(argv = process.argv.slice(2), out = (line) => console.log(line)) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") { out(USAGE); return argv.length ? 0 : 2; }
  try {
    const { command, target, opts } = parseArgs(argv);
    if (!target) { out(USAGE); return 2; }
    if (command === "create") return await create(target, opts, out);
    if (command === "outline") return outline(target, opts, out);
    if (command === "edit") return await edit(target, opts, out);
    if (command === "share") return share(target, opts, out);
    if (command === "snapshot") return snapshot(target, opts, out);
    out(USAGE);
    return 2;
  } catch (error) {
    const known = error instanceof EditError || error instanceof GwsError;
    console.error(`ERROR: ${known ? error.message : error.message || error}`);
    if (!known && process.env.GDOC_DEBUG) console.error(error.stack);
    return 1;
  }
}

if (isEntrypoint(import.meta.url)) process.exitCode = await main();
