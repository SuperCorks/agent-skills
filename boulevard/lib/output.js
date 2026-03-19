const fs = require("fs");
const path = require("path");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureParentDirectory(filePath) {
  const directory = path.dirname(path.resolve(filePath));
  fs.mkdirSync(directory, { recursive: true });
}

function writeJsonFile(filePath, payload) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(payload, null, 2));
  return path.resolve(filePath);
}

function buildDefaultOutputPath(scriptName, parts = []) {
  const filteredParts = parts.map(slugify).filter(Boolean);
  const filename = [slugify(scriptName), ...filteredParts].join("-") || "boulevard-output";
  return path.join("/tmp", `${filename}.json`);
}

module.exports = {
  buildDefaultOutputPath,
  slugify,
  writeJsonFile,
};
