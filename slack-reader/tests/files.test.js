const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sanitizeFileName, fetchSlackFile, downloadFile } = require('../lib/files');

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    fs.promises.rm(directory, { recursive: true, force: true })
  )));
});

describe('Slack file downloads', () => {
  it('sanitizes paths and unsafe filename characters', () => {
    assert.equal(sanitizeFileName('../../report:final?.pdf'), 'report_final_.pdf');
  });

  it('sends authorization only to Slack hosts across redirects', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/file.png' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    const response = await fetchSlackFile('https://files.slack.com/file.png', 'xoxp-secret', fetchImpl);
    assert.equal(response.status, 200);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer xoxp-secret');
    assert.deepEqual(calls[1].options.headers, {});
  });

  it('downloads binary content and avoids overwriting existing files', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'slack-reader-test-'));
    temporaryDirectories.push(directory);
    const file = {
      id: 'F123',
      name: 'image.png',
      mimetype: 'image/png',
      size: 3,
      url_private_download: 'https://files.slack.com/image.png',
    };
    const fetchImpl = async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });

    const first = await downloadFile(file, 'xoxp-secret', directory, fetchImpl);
    const second = await downloadFile(file, 'xoxp-secret', directory, fetchImpl);

    assert.equal(path.basename(first.path), 'image.png');
    assert.equal(path.basename(second.path), 'image-2.png');
    assert.deepEqual(await fs.promises.readFile(first.path), Buffer.from([1, 2, 3]));
  });

  it('rejects Slack HTML access pages', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'slack-reader-test-'));
    temporaryDirectories.push(directory);
    const fetchImpl = async () => new Response('<html>sign in</html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    await assert.rejects(
      downloadFile({
        id: 'F123',
        name: 'image.png',
        mimetype: 'image/png',
        size: 3,
        url_private_download: 'https://files.slack.com/image.png',
      }, 'xoxp-secret', directory, fetchImpl),
      { code: 'SLACK_FILE_DOWNLOAD_FAILED' }
    );
  });
});
