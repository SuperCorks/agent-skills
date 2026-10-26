// Google fetches an inserted image from a public URL, once, and keeps its own copy. Images go up
// as Drive files shared with "anyone with the link" just long enough for the batch that inserts
// them, then the files are deleted (not trashed). Data URIs are refused (2 KB URL limit) and
// private Drive files cannot be fetched, so this is the shortest exposure available.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONTENT_WIDTH } from "./gdoc-blocks.mjs";
import { drive } from "./gws.mjs";

const EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif" };

/** Pixel size of a PNG, JPEG, or GIF, or null. */
export function imageSize(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length > 10 && bytes.toString("ascii", 0, 3) === "GIF") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      const length = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      i += 2 + length;
    }
  }
  return null;
}

/** Width in points: CSS width for drawings (0.75 pt per px), else pixels at 0.75, within the text column. */
export function widthFor(image) {
  if (image.cssWidth) return Math.min(CONTENT_WIDTH, image.cssWidth * 0.75);
  const size = imageSize(image.bytes);
  return size ? Math.min(CONTENT_WIDTH, size.width * 0.75) : CONTENT_WIDTH;
}

/**
 * Upload `images` (Map key -> {bytes, mime, cssWidth?}) and share them for reading.
 * Returns {uris: Map key -> {uri, width}, cleanup()}; always call cleanup.
 */
export function hostImages(images, { account, api = drive } = {}) {
  const uris = new Map();
  const uploaded = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), "gdoc-images-"));
  const byHash = new Map();
  const cleanup = () => {
    const failed = [];
    for (const id of uploaded) {
      try { api.remove(account, id); } catch (error) { failed.push(`${id} (${error.message})`); }
    }
    uploaded.length = 0;
    rmSync(dir, { recursive: true, force: true });
    if (failed.length) throw new Error(`could not delete the temporary image files ${failed.join(", ")}; delete them in Drive`);
  };
  try {
    for (const [key, image] of images) {
      const hash = createHash("sha256").update(image.bytes).digest("hex").slice(0, 16);
      if (!byHash.has(hash)) {
        const name = `${hash}${EXT[image.mime] || ".png"}`;
        writeFileSync(path.join(dir, name), image.bytes);
        const file = api.upload(account, dir, name, `gdoc-temporary-image-${name}`);
        uploaded.push(file.id);
        api.share(account, file.id, { role: "reader", type: "anyone" });
        byHash.set(hash, `https://drive.google.com/uc?export=download&id=${file.id}`);
      }
      uris.set(key, { uri: byHash.get(hash), width: Math.round(widthFor(image) * 100) / 100 });
    }
  } catch (error) {
    try { cleanup(); } catch {}
    throw error;
  }
  return { uris, cleanup };
}
