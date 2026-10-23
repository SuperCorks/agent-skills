# Machine wiring

Exact procedures for the pieces outside the workspace repo. Load `remote-hosts` for SSH and the host map, `kernel` for the Agent API, `web-computer-use` for browser work.

## Agent projects

### T3 Code
- Each machine runs its own T3 server with data in `~/.t3-fork`. Use the CLI bundled with that server: `t3cork project add <abs path> --title <title>` (also `rename`, `remove`; no list command and no icon flag).
- Verify read-only: `sqlite3 "file:$HOME/.t3-fork/userdata/statev2.sqlite?mode=ro" "select project_id, title, workspace_root from projection_projects"` (check the column names with `.schema projection_projects` first).
- Icon: the user sets it in the app. Stored as `project_icon_json` `{"kind":"emoji","emoji":"…"}` or a repo-relative favicon.

### Codex
- **Mac**: the Codex desktop app owns its projects. Don't edit its state files while it runs. **User step:** Add project → the workspace path, named `<emoji> <Name>`. Then read the id read-only from `~/.codex/state_5.sqlite` (`projects` and `project_roots`); all `~/.codex_*` homes share it.
- **Remote**: the remote's Codex server must own the project, or Kernel can't map it. Copy [scripts/codex-appserver.mjs](../scripts/codex-appserver.mjs) to the remote and run it there under the `CODEX_HOME` the companion uses. It starts a stdio `codex app-server`, initializes with the experimental API, and runs a list of calls:
  ```bash
  node codex-appserver.mjs '[["project/list",{}]]'
  node codex-appserver.mjs '[["project/create",{"name":"🩺 Acme Health","roots":[{"path":"/workspaces/acme-health"}],"idempotencyKey":"<uuid>"}]]'
  ```
  Back up `~/.codex/state_5.sqlite` first. Check field names against the installed version's generated schema (see `codex app-server --help`). `codex app-server proxy` does not accept plain JSON-RPC on stdin.
- **Re-rooting** a project keeps its id, so Kernel mappings stay valid: `["project/update",{"projectId":"<id>","roots":[{"path":"<new root>"}]}]`. On the Mac, only with the Codex app fully quit (Cmd-Q), or the user changes the folder in the app.
- **Trust**: add the workspace root and each child to `~/.codex/config.toml` on each machine:
  ```toml
  [projects."/abs/path"]
  trust_level = "trusted"
  ```

## Kernel preflight

Per machine, before any mapping write:
1. `krnl status`: Codex and T3 Code connected; note the account.
2. Companion environment. Mac: LaunchAgents `work.krnl.companion.<machine-id>`, state under `~/Library/Application Support/Kernel/{Codex,T3Code}/`. Remote: tmux `-L kernel-companion`; check `tmux -L kernel-companion show-environment -g` for a stray `CODEX_HOME`.
3. Hooks: the companion's `CODEX_HOME/hooks.json` contains all eight Kernel hooks, and machine health shows `hooksReady`. Hooks are global to that `CODEX_HOME`: a new folder needs no approval of its own once they're trusted. Repair: back up, then `CODEX_HOME=<home> krnl connect codex` (reuses the existing machine id). **User step** only after a repair adds untrusted hooks: `/hooks` in plain `codex`.
4. Machine health in Kernel (`GET /integrations/codex/settings`, `/integrations/t3code/settings`): reachable, `hooksReady`, `issue: null`, the target model listed, the saved project listed with no `issue`.
5. T3 Code: Kernel can map only T3 projects the host's companion has reported, so a new T3 project waits until the machine is reachable (`t3code_project_unavailable` otherwise).

## Kernel mappings

- Codex: `PUT /integrations/codex/mappings` with `protocolVersion: 1`, `scope` (`organization`|`project`), `scopeId`, `machineId`, `projectId` (host-side saved project id), `checkout`, `model`, `reasoningEffort`, `taskNamePrefix`, `version: 0` to create.
- T3 Code: `PUT /integrations/t3code/mappings` with the same plus `modelSelection {instanceId, model, options}` and `runtimeMode`.
- One mapping per machine per agent. Copy field shapes from an existing mapping. Every mutation needs an `Idempotency-Key`.
- Errors seen: `codex_project_unavailable` (hooks not approved in the folder, or the saved project has an issue), model unavailable (host catalog lacks the model), `version_conflict`.

## Kernel org and projects

- Org: `POST /organizations` (`name`, `slug`, `keyPrefix`, optional `notes`, avatar fields); image avatar via `POST /organizations/{id}/image`. Pricing: `PATCH /organizations/{id}/pricing` then `POST …/pricing/terms`. Payer: Kernel UI only.
- Project: `POST /projects` (`organizationId`, `name`, `slug`, optional `keyPrefix`, `notes`, `billing`).
- Tabs: `POST …/documents` (`title`, `body`), order with `PUT …/documents/order`. LLM.txt: `PUT …/llm-txt` (`body`, `version`, 0 creates).

## Chrome

- Profiles: `~/Library/Application Support/Google/Chrome/Local State` → `profile.info_cache` (directory → name).
- Required extensions per client profile (check `<profile>/Extensions/<id>`):

  | Extension | ID |
  | --- | --- |
  | BrowserSkill | `hhcmgoofomhgciiibhipgmgkgnoenaoi` |
  | Web Computer Use | `djakclpnmkkoogebafphakemgpbaiofc` (unpacked) |
  | ChatGPT | `hehggadaopoacecdllhhajmbjkdcmajg` |
  | Keeper | `bfogiafebfohielmmehodmfbbebbbpei` |

- ChatGPT settings, both required:
  - "Allow access to file URLs" on its `chrome://extensions/?id=hehggadaopoacecdllhhajmbjkdcmajg` page. Stored as `extensions.settings.<id>.newAllowFileAccess` in `<profile>/Secure Preferences`.
  - The optional `downloads.open` permission granted (check the extension's granted permissions in `Secure Preferences`; it's granted when the extension asks or from its site/permission settings).
  These are browser UI toggles: **User step**, or Computer Use with the user's go-ahead.
- BrowserSkill instance ids: `scripts/bsk_profiles.py resolve "<name>"` in the web-computer-use skill refreshes `~/.local/state/web-computer-use/bsk-profiles.json`.
- Launcher: `~/.raycast-scripts/chrome-<client>.sh` opening `--profile-directory="Profile N"`, copied from an existing one.

## Remote host

- Toolchain present: node (system plus fnm), pnpm, bun, uv, docker (rootless sidecar), gh (SuperCorks), gcloud, gws, mise (installed 2026-10-18). Check before assuming.
- Agent shells are `bash -lc`, which reads `~/.profile` then `~/.bashrc` and stops at its interactive guard. Anything agents need on `PATH` (for example mise shims) goes in `~/.bashrc` **before** the guard; interactive activation goes after it. Running services pick up rc changes only on their next restart.
- Remote shell secrets: `~/.config/agent-env/secrets.env` (mode 600), sourced by the shell rc files.
- Gateways: run the repo's `.devcontainer/install-host-command.sh` on the remote too; links in `~/.local/bin` don't sync.
- Registry: `/workspaces/WORKSPACES.md` and `hosts.local.md`, see [conventions.md](conventions.md#remote-registry).
