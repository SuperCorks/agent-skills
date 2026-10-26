// Google Docs and Drive calls through the `gws` CLI. With an account alias the call runs as
// `gswitch run <alias> -- gws …`, so it uses that Google account without changing the global
// one; without one, plain `gws` and its own default account. HRB_GWS points tests at a fake.
import { spawnSync } from "node:child_process";

export class GwsError extends Error {}

const onPath = (name) => spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).status === 0;

export function gwsCommand(account) {
  if (process.env.HRB_GWS) return { cmd: process.execPath, args: [process.env.HRB_GWS], env: { HRB_GWS_ACCOUNT: account || "" } };
  if (account) {
    if (!onPath("gswitch")) throw new GwsError(`--account ${account} needs gswitch (https://github.com/supercorks) on PATH; without it, run gws's default account by leaving --account out`);
    return { cmd: "gswitch", args: ["run", account, "--", "gws"], env: {} };
  }
  if (!onPath("gws")) throw new GwsError("gws is not installed (npm i -g @googleworkspace/cli); see the google-workspace skill");
  return { cmd: "gws", args: [], env: {} };
}

/** Run one gws call and parse its JSON output. */
export function gws(args, { account, cwd } = {}) {
  const { cmd, args: prefix, env } = gwsCommand(account);
  const result = spawnSync(cmd, [...prefix, ...args], { cwd, encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, ...env } });
  const stdout = (result.stdout || "").split("\n").filter((line) => !line.startsWith("Using keyring backend")).join("\n").trim();
  if (result.error) throw new GwsError(`${cmd} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    let message = stdout || (result.stderr || "").trim();
    try { message = JSON.parse(stdout).error?.message || message; } catch {}
    throw new GwsError(message.split("\n").filter((line) => !line.startsWith("Using keyring backend")).join(" ").slice(0, 600) || `gws exited with ${result.status}`);
  }
  if (!stdout) return null;
  try { return JSON.parse(stdout); } catch { return stdout; }
}

const json = (value) => JSON.stringify(value);

export const docs = {
  get: (account, documentId) => gws(["docs", "documents", "get", "--params", json({ documentId, includeTabsContent: true, commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED", suggestionsViewMode: "SUGGESTIONS_INLINE" })], { account }),
  batch: (account, documentId, requests, writeControl) => gws(["docs", "documents", "batchUpdate", "--params", json({ documentId }), "--json", json({ requests, ...(writeControl ? { writeControl } : {}) })], { account }),
};

export const drive = {
  createDoc: (account, { name, folder }) => gws(["drive", "files", "create", "--params", json({ fields: "id,name,webViewLink", supportsAllDrives: true }), "--json", json({ name, mimeType: "application/vnd.google-apps.document", ...(folder ? { parents: [folder] } : {}) })], { account }),
  upload: (account, cwd, file, name) => gws(["drive", "files", "create", "--params", json({ fields: "id", supportsAllDrives: true }), "--json", json({ name }), "--upload", file], { account, cwd }),
  share: (account, fileId, permission, { notify = false, message } = {}) => gws(["drive", "permissions", "create", "--params", json({ fileId, sendNotificationEmail: notify, supportsAllDrives: true, ...(notify && message ? { emailMessage: message } : {}) }), "--json", json(permission)], { account }),
  unshare: (account, fileId, permissionId) => gws(["drive", "permissions", "delete", "--params", json({ fileId, permissionId, supportsAllDrives: true })], { account }),
  remove: (account, fileId) => gws(["drive", "files", "delete", "--params", json({ fileId, supportsAllDrives: true })], { account }),
  file: (account, fileId, fields = "id,name,webViewLink,modifiedTime,lastModifyingUser(displayName,me)") => gws(["drive", "files", "get", "--params", json({ fileId, fields, supportsAllDrives: true })], { account }),
  exportTo: (account, cwd, fileId, mimeType, output) => gws(["drive", "files", "export", "--params", json({ fileId, mimeType }), "--output", output], { account, cwd }),
};
