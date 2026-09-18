// Behavioral checks for generated output. Requires Playwright; never uses a user profile.
// Run: NODE_PATH=/path/to/node_modules node tests/browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-browser-'));
  const skill = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ headless: true });
  let server;
  let checks = 0;
  const pass = (name) => { checks++; console.log(`PASS ${name}`); };
  try {
    const capture = await browser.newPage();
    for (const [name, width, height] of [['wide', 1280, 800], ['tall', 390, 1600]]) {
      await capture.setViewportSize({ width, height });
      await capture.setContent(`<html><body style="margin:0;background:#edf4f4;color:#172536;font:24px system-ui"><h1 style="padding:32px">Synthetic viewer test: ${name}</h1><p style="padding:32px">Only a renderer fixture, not product evidence.</p><footer style="position:absolute;bottom:0;padding:32px">Bottom edge must remain visible in Fit.</footer></body></html>`);
      await capture.screenshot({ path: path.join(root, `${name}.png`) });
    }
    await capture.close();
    const image = (src, caption) => ({ src, caption, alt: caption });
    const story = (id, title, images) => ({
      id, title, persona: 'reader', purpose: 'Inspect this synthetic test sequence.',
      preconditions: ['Use a generated test document.'], trigger: 'Open the story.',
      steps: [{ action: 'Inspect the screens', result: 'The sequence belongs to this story.', images }],
      outcome: 'The correct sequence is visible.'
    });
    const data = {
      id: 'viewer-test', title: 'Viewer behavior fixture', summary: 'Synthetic test content.',
      personas: [{ id: 'reader', name: 'Reader', description: 'A person inspecting screenshots.' }],
      stories: [
        story('alpha', 'Alpha journey', [image('wide.png', 'Alpha start'), image('tall.png', 'Alpha portrait'), image('wide.png', 'Alpha end')]),
        story('beta', 'Beta journey', [image('wide.png', 'Beta shared image'), image('tall.png', 'Beta end')]),
        story('gamma', 'Single image journey', [image('tall.png', 'Only image')])
      ]
    };
    const input = path.join(root, 'atlas.json');
    await fs.writeFile(input, JSON.stringify(data));
    function build(destination, layout, notes, source = input, replace = false) {
      const args = [path.join(skill, 'scripts/build_atlas.py'), source, '--output', path.join(root, destination), '--layout', layout, '--review-notes', notes];
      if (replace) args.push('--replace');
      execFileSync(process.env.PYTHON || 'python3', args, { stdio: 'pipe' });
    }
    build('single', 'single', 'yes');
    build('catalog', 'catalog', 'yes');
    build('plain', 'single', 'no');
    await fs.writeFile(path.join(root, 'other.json'), JSON.stringify({ ...data, id: 'other-atlas' }));
    build('other', 'single', 'yes', path.join(root, 'other.json'));
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
    server = http.createServer(async (req, res) => {
      try {
        const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const target = path.resolve(root, '.' + requestPath);
        if (!target.startsWith(root + path.sep)) throw new Error('Outside fixture');
        const content = await fs.readFile(target);
        res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
        res.end(content);
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/single/index.html`);
    const open = async (id, index) => {
      await page.locator(`[data-story-id="${id}"] [data-view-image]`).nth(index).click();
      await page.waitForFunction(() => { const i = document.querySelector('.viewer-image'); return i.complete && i.naturalWidth > 0; });
    };
    const at = async (title, caption, position) => {
      assert.equal(await page.locator('#viewer-title').textContent(), title);
      assert.equal(await page.locator('#viewer-caption').textContent(), caption);
      assert.equal(await page.locator('.viewer-position').textContent(), position);
    };
    await open('alpha', 0);
    await at('Alpha journey', 'Alpha start', 'Image 1 of 3');
    assert.equal(await page.locator('[data-previous]').isDisabled(), true);
    await page.keyboard.press('ArrowLeft');
    await at('Alpha journey', 'Alpha start', 'Image 1 of 3');
    await page.locator('[data-next]').click();
    await at('Alpha journey', 'Alpha portrait', 'Image 2 of 3');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await at('Alpha journey', 'Alpha end', 'Image 3 of 3');
    assert.equal(await page.locator('[data-next]').isDisabled(), true);
    pass('pointer and keyboard navigation clamp to the active story');

    await page.locator('[data-fullscreen]').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.keyboard.press('ArrowLeft');
    await at('Alpha journey', 'Alpha portrait', 'Image 2 of 3');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await at('Alpha journey', 'Alpha end', 'Image 3 of 3');
    await page.locator('[data-fullscreen]').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    pass('actual native fullscreen preserves story boundaries');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.viewer').evaluate(el => el.open), false);
    assert.equal(await page.locator('[data-story-id="alpha"] [data-view-image]').first().evaluate(el => el === document.activeElement), true);
    pass('Escape closes and restores originating focus');

    await open('beta', 0);
    await at('Beta journey', 'Beta shared image', 'Image 1 of 2');
    await page.keyboard.press('ArrowRight');
    await at('Beta journey', 'Beta end', 'Image 2 of 2');
    await page.locator('[data-close]').click();
    await open('gamma', 0);
    assert.equal(await page.locator('.viewer-navigation').isVisible(), false);
    await page.keyboard.press('ArrowRight');
    await at('Single image journey', 'Only image', 'Image 1 of 1');
    pass('shared assets respect ownership and single-image navigation stays hidden');
    assert.equal(await page.locator('.viewer-image').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    await page.locator('[data-zoom]').click();
    assert.equal(await page.locator('.viewer-stage').evaluate(el => el.scrollHeight > el.clientHeight), true);
    await page.locator('[data-zoom]').click();
    assert.equal(await page.locator('.viewer-stage').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true);
    pass('portrait image fits completely and zoom exposes scrollable detail');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.viewer')), true);
    }
    pass('modal contains keyboard focus');
    await page.locator('[data-close]').click();

    const note = page.locator('[data-story-id="alpha"] textarea');
    await note.fill('Alpha feedback');
    await note.press('ArrowLeft');
    assert.equal(await page.locator('.viewer').evaluate(el => el.open), false);
    await page.locator('[data-story-id="beta"] textarea').fill('Beta feedback');
    await page.reload();
    assert.equal(await note.inputValue(), 'Alpha feedback');
    assert.equal(await page.locator('[data-story-id="beta"] textarea').inputValue(), 'Beta feedback');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-story-id="alpha"] [data-export-notes]').click();
    const download = await downloadPromise;
    const exported = await fs.readFile(await download.path(), 'utf8');
    assert.match(exported, /Alpha feedback/);
    assert.match(exported, /alpha/);
    pass('notes support editing, persistence, and identified Markdown export');
    build('single', 'single', 'yes', input, true);
    await page.reload();
    assert.equal(await note.inputValue(), 'Alpha feedback');
    await page.goto(`${base}/other/index.html`);
    assert.equal(await page.locator('[data-story-id="alpha"] textarea').inputValue(), '');
    pass('refresh preserves notes and atlas identities isolate notes');

    await page.goto(`${base}/catalog/index.html`);
    await page.locator('a[href="stories/alpha.html"]').click();
    await open('alpha', 1);
    await at('Alpha journey', 'Alpha portrait', 'Image 2 of 3');
    await page.locator('[data-close]').click();
    await page.locator('textarea').fill('Catalog alpha');
    await page.goto(`${base}/catalog/stories/beta.html`);
    await page.locator('textarea').fill('Catalog beta');
    const allDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export atlas notes', exact: true }).click();
    const allDownload = await allDownloadPromise;
    const allText = await fs.readFile(await allDownload.path(), 'utf8');
    assert.match(allText, /Catalog alpha/); assert.match(allText, /Catalog beta/);
    pass('catalog navigation, image paths, and cross-page note export work');

    await page.goto(`${base}/plain/index.html`);
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.getByRole('button', { name: /export/i }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await open('alpha', 1);
    const bounds = await page.locator('.viewer').boundingBox();
    assert(bounds.width <= 390 && bounds.height <= 844);
    await page.screenshot({ path: path.join(root, 'viewer-mobile.png') });
    await page.locator('[data-close]').click();
    await page.screenshot({ path: path.join(root, 'atlas-mobile.png'), fullPage: true });
    pass('notes-off output and mobile viewer reflow work');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/single/index.html`);
    await page.screenshot({ path: path.join(root, 'atlas-desktop.png') });

    const blocked = await browser.newPage();
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled for test'); } });
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('Fullscreen rejected for test'));
    });
    await blocked.goto(`${base}/single/index.html`);
    await blocked.locator('[data-story-id="alpha"] textarea').fill('Unsaved but exportable');
    assert.match(await blocked.locator('[data-story-id="alpha"] .review-status').textContent(), /could not be saved|unavailable/i);
    const blockedDownloadPromise = blocked.waitForEvent('download');
    await blocked.locator('[data-story-id="alpha"] [data-export-notes]').click();
    assert.match(await fs.readFile(await (await blockedDownloadPromise).path(), 'utf8'), /Unsaved but exportable/);
    await blocked.locator('[data-story-id="alpha"] [data-view-image]').first().click();
    await blocked.locator('[data-fullscreen]').click();
    assert.match(await blocked.locator('.viewer-status').textContent(), /unavailable/i);
    assert.equal(await blocked.locator('.viewer').evaluate(el => el.open), true);
    pass('storage/fullscreen rejection retains usable editing, export, and viewer');
    await blocked.close();

    const missing = await browser.newPage();
    await missing.route('**/images/**', route => route.abort());
    await missing.goto(`${base}/plain/index.html`);
    await missing.locator('[data-story-id="beta"] [data-view-image]').first().click();
    await missing.waitForFunction(() => document.querySelector('.viewer-status').textContent.includes('could not be loaded'));
    assert.equal(await missing.locator('#viewer-caption').textContent(), 'Beta shared image');
    assert.equal(await missing.locator('[data-zoom]').isDisabled(), true);
    await missing.locator('[data-close]').click();
    pass('failed image retains its caption and a usable close control');
    await missing.close();

    await page.goto('file://' + path.join(root, 'plain/index.html'));
    await open('beta', 0);
    await at('Beta journey', 'Beta shared image', 'Image 1 of 2');
    pass('portable file-based output loads viewer and local images');
    assert.deepEqual(errors, []);
    pass('no browser exceptions or failed artifact requests');
    console.log(JSON.stringify({ checks, artifacts: root }));
  } finally {
    await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
