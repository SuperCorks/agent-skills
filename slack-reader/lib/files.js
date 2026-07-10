/**
 * Download files attached to Slack messages.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { SkillError } = require('./errors');

function sanitizeFileName(name, fallback = 'slack-file') {
  const baseName = path.basename(name || fallback);
  const sanitized = baseName
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();

  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : fallback;
}

async function uniqueDestination(outputDir, fileName) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = path.join(outputDir, fileName);
  let suffix = 2;

  while (true) {
    try {
      await fs.promises.access(candidate);
      candidate = path.join(outputDir, `${stem}-${suffix}${extension}`);
      suffix += 1;
    } catch (err) {
      if (err.code === 'ENOENT') return candidate;
      throw err;
    }
  }
}

function isSlackHost(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname === 'slack.com' || hostname.endsWith('.slack.com');
}

async function fetchSlackFile(url, token, fetchImpl = fetch) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const headers = isSlackHost(currentUrl) ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetchImpl(currentUrl, { headers, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`HTTP ${response.status} redirect without a location`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    return response;
  }

  throw new Error('Too many redirects');
}

async function downloadFile(file, token, outputDir, fetchImpl = fetch) {
  const url = file.url_private_download || file.url_private;
  if (!url) {
    throw new SkillError('SLACK_FILE_DOWNLOAD_FAILED', `${file.id || file.name}: no private download URL`);
  }

  const resolvedOutputDir = path.resolve(outputDir);
  await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

  const fileName = sanitizeFileName(file.name, file.id || 'slack-file');
  const destination = await uniqueDestination(resolvedOutputDir, fileName);
  const temporaryPath = `${destination}.part-${process.pid}`;

  try {
    const response = await fetchSlackFile(url, token, fetchImpl);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('text/html') && file.mimetype !== 'text/html') {
      throw new Error('Slack returned an HTML access page instead of the file; verify files:read and reinstall the app');
    }
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(temporaryPath, { flags: 'wx' })
    );
    await fs.promises.rename(temporaryPath, destination);
    const stats = await fs.promises.stat(destination);
    if (Number.isInteger(file.size) && stats.size !== file.size) {
      await fs.promises.rm(destination, { force: true });
      throw new Error(`Downloaded ${stats.size} bytes; expected ${file.size}`);
    }

    return {
      id: file.id || null,
      name: file.name || fileName,
      mimetype: file.mimetype || null,
      expectedBytes: file.size ?? null,
      downloadedBytes: stats.size,
      path: destination,
    };
  } catch (err) {
    await fs.promises.rm(temporaryPath, { force: true });
    if (err instanceof SkillError) throw err;
    throw new SkillError('SLACK_FILE_DOWNLOAD_FAILED', `${file.id || file.name}: ${err.message}`);
  }
}

function collectFiles(messages) {
  return messages.flatMap(message => (message.files || []).map(file => ({
    messageTs: message.ts,
    file,
  })));
}

module.exports = {
  sanitizeFileName,
  fetchSlackFile,
  downloadFile,
  collectFiles,
};
