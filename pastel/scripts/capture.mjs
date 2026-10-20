#!/usr/bin/env node
/*
 * Screenshot the element each Pastel comment points at, at the reviewer's
 * viewport, for the before and after columns of the feedback report.
 *
 *   node scripts/capture.mjs --comments comments.json --label before --out review/before \
 *     [--origin http://localhost:3000] [--targets targets.json] [--setup sign-in.mjs]
 *
 * Playwright comes from the project being reviewed (--project-dir, default the
 * current directory), so the skill installs nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const HELP = `
Screenshot the element each Pastel comment points at, at the reviewer's viewport.

Usage:
  node scripts/capture.mjs --comments comments.json --label before|after --out DIR [options]

Options:
  --comments <file>       Output of read-comments.js (JSON)
  --label <label>         before or after; recorded in capture.json
  --out <dir>             Directory for <number>.jpg files and capture.json
  --numbers <list>        Only these comment numbers
  --origin <url>          Replace each comment page's origin, e.g. http://localhost:3000
  --targets <file>        Per-comment overrides: {"38": {"url": "/stays?view=cancelled",
                          "selector": ".status-label", "width": 1440, "height": 900,
                          "mode": "viewport", "auth": false}}
                          auth: false captures that comment signed out (no --setup)
  --setup <file.mjs>      Module whose default export async ({ page, context, origin })
                          signs in or seeds state once per browser context
  --storage-state <file>  Playwright storage state to start from (an existing sign-in)
  --mode <mode>           element (default: the target plus context) or viewport
  --context <px>          CSS pixels kept around the element. Default 160
  --project-dir <dir>     Where to resolve playwright from. Default: current directory
  --help                  Show this help message

The element is found by the override selector, else Pastel's recorded selector,
else the position Pastel recorded (box plus scroll). capture.json says which, and
flags a selector match far from where the reviewer clicked.
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function fail(code, message) {
  console.error(JSON.stringify({ error: { code, message } }, null, 2));
  process.exit(1);
}

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('PASTEL_INPUT_INVALID', `Could not read ${what} ${file}: ${error.message}`);
  }
}

function loadPlaywright(projectDir) {
  for (const base of [projectDir, process.cwd()]) {
    const require = createRequire(path.join(path.resolve(base), 'package.json'));
    for (const name of ['playwright', '@playwright/test']) {
      try {
        return require(name);
      } catch {
        // Try the next candidate.
      }
    }
  }
  fail('PASTEL_PLAYWRIGHT_MISSING', `No playwright or @playwright/test under ${projectDir}. Pass --project-dir pointing at a project that has one.`);
}

async function launch(chromium) {
  try {
    return await chromium.launch();
  } catch (error) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      fail('PASTEL_PLAYWRIGHT_MISSING', `Could not start a browser (${error.message.split('\n')[0]}). Run "npx playwright install chromium" in the project.`);
    }
  }
}

function resolveUrl(comment, override, origin) {
  const raw = override.url || comment.pageUrl;
  if (!raw) return null;
  const base = origin || (comment.pageUrl ? new URL(comment.pageUrl).origin : undefined);
  const url = new URL(raw, base);
  if (origin && !override.url?.startsWith('http')) {
    const target = new URL(origin);
    url.protocol = target.protocol;
    url.host = target.host;
  }
  return url.toString();
}

function expand(box, context, page) {
  const minWidth = 480;
  const minHeight = 260;
  let width = Math.max(box.width + context * 2, minWidth);
  let height = Math.max(box.height + context * 2, minHeight);
  let x = box.x + box.width / 2 - width / 2;
  let y = box.y + box.height / 2 - height / 2;
  width = Math.min(width, page.width);
  height = Math.min(height, page.height);
  x = Math.min(Math.max(0, x), page.width - width);
  y = Math.min(Math.max(0, y), page.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

async function locate(page, selector) {
  if (!selector) return null;
  try {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0 || !(await locator.isVisible())) return null;
    await locator.scrollIntoViewIfNeeded({ timeout: 3_000 });
    const box = await locator.boundingBox();
    if (!box) return null;
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    return { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height };
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }
  if (!args.comments || !args.out || !args.label) {
    fail('PASTEL_ARGS_INVALID', 'Provide --comments, --label, and --out');
  }

  const parsed = readJson(args.comments, 'comments');
  const comments = Array.isArray(parsed) ? parsed : parsed.comments;
  if (!Array.isArray(comments)) fail('PASTEL_INPUT_INVALID', `${args.comments} has no comments array`);
  const targets = args.targets ? readJson(args.targets, 'targets') : {};
  const numbers = typeof args.numbers === 'string' ? args.numbers.split(',').map((value) => Number(value.trim())) : null;
  const context = args.context ? Number(args.context) : 160;
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = loadPlaywright(args.projectDir || process.cwd());
  const browser = await launch(chromium);
  const results = [];
  const contexts = new Map();

  try {
    for (const comment of comments) {
      if (numbers && !numbers.includes(comment.number)) continue;
      const override = targets[String(comment.number)] || {};
      const reviewer = comment.metadata?.window || {};
      const width = override.width || reviewer.width || 1440;
      const height = Math.max(override.height || reviewer.height || 900, 720);
      const scale = Math.min(reviewer.devicePixelRatio || 2, 2);
      const url = resolveUrl(comment, override, args.origin);
      const file = path.join(outDir, `${comment.number}.jpg`);
      const result = { number: comment.number, label: args.label, file: path.basename(file), url, located: 'failed' };

      if (!url) {
        results.push({ ...result, error: 'The comment has no page URL; add one in --targets' });
        continue;
      }

      // Signed-out targets (a public sign-in page, say) get their own context
      // without --setup or --storage-state, so they are not redirected.
      const signedIn = override.auth !== false;
      const key = `${width}x${height}@${scale}:${signedIn ? 'auth' : 'anon'}`;
      if (!contexts.has(key)) {
        const browserContext = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: scale,
          ...(signedIn && args.storageState ? { storageState: args.storageState } : {}),
        });
        if (signedIn && args.setup) {
          const setup = await import(pathToFileURL(path.resolve(args.setup)).href);
          const setupPage = await browserContext.newPage();
          await setup.default({ page: setupPage, context: browserContext, origin: args.origin || new URL(url).origin });
          await setupPage.close();
        }
        contexts.set(key, browserContext);
      }
      const browserContext = contexts.get(key);
      const page = await browserContext.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => page.waitForLoadState('load'));
        await page.waitForTimeout(500);

        const size = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        const mode = override.mode || args.mode || 'element';
        let clip = null;

        if (mode === 'viewport') {
          const offset = override.scrollY ?? reviewer.pageYOffset ?? 0;
          clip = { x: 0, y: Math.min(offset, Math.max(0, size.height - height)), width, height };
          result.located = 'viewport';
        } else {
          const selector = override.selector || comment.targetSelector;
          const found = await locate(page, selector);
          const recorded = comment.metadata?.boundingBox;
          const recordedBox = recorded
            ? {
                x: recorded.left + (reviewer.pageXOffset || 0),
                y: recorded.top + (reviewer.pageYOffset || 0),
                width: recorded.width,
                height: recorded.height,
              }
            : null;
          if (found) {
            clip = expand(found, context, size);
            result.located = override.selector ? 'override-selector' : 'pastel-selector';
            result.selector = selector;
            // Pastel's selectors are positional; a match far from the click is suspect.
            if (!override.selector && recordedBox && Math.hypot(found.x - recordedBox.x, found.y - recordedBox.y) > 150) {
              result.warning = 'Selector matched an element far from where the reviewer clicked; check the image or add a --targets override';
            }
          } else if (recordedBox) {
            clip = expand(recordedBox, context, size);
            result.located = 'recorded-position';
            result.warning = 'Selector did not match; used the position Pastel recorded';
          }
        }

        if (!clip) {
          result.error = 'Could not find the element; add a selector in --targets';
        } else {
          await page.screenshot({ path: file, type: 'jpeg', quality: 80, fullPage: true, clip });
          result.clip = clip;
        }
      } catch (error) {
        result.error = error.message.split('\n')[0];
      } finally {
        await page.close();
      }
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const manifest = { label: args.label, capturedAt: new Date().toISOString(), origin: args.origin || null, results };
  fs.writeFileSync(path.join(outDir, 'capture.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ...manifest, manifest: path.join(outDir, 'capture.json') }, null, 2));
}

main().catch((error) => fail('PASTEL_CAPTURE_FAILED', error.message));
