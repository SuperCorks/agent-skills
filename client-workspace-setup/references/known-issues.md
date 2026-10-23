# Known issues

Problems hit in past setups, with the check that catches each one and its fix. Which clients hit them, and their client-specific fixes, are in `../clients.local.md`.

## Workspace and toolchain

- **`~/.npmrc` token sent to other registries.** Bun sends the npm token from `~/.npmrc` to any registry a lockfile names; Lovable's npm cache answers `403`. Check: install fails with 403 on the same packages every time while `curl` without auth gets 200. Fix: install with an empty `HOME` that keeps the normal bun cache, through a small script in the workspace (for example `scripts/bun-install-clean-home.sh`). Never edit the client's lockfile or `bunfig.toml`.
- **Port clashes with other clients.** Other projects' containers hold common ports (5432, 5433). Check with `lsof -iTCP:<port> -sTCP:LISTEN` and `docker ps`. Fix: the client's own offset or override mechanism in a gitignored local file (for example a port offset in `mise.local.toml`). Never stop another client's container.
- **Stray config files picked up by mise.** A copy of a client's `mise.toml` left in a temp folder made login shells fail. Keep scratch copies of client config out of directories mise walks, and delete them when done.
- **Playwright browser install prunes other browsers.** Installing one Playwright browser can delete cached browsers it considers unused. Mention it in the handoff.
- **Validators still checking `.code-workspace`.** Older workspaces' `validate-workspace.sh` compares folders against `<slug>.code-workspace`. New workspaces don't have one; the skill's scaffold doesn't check it.

## Credentials

- **SSO meant for client employees.** Some clients' AWS SSO goes through their HR or identity provider, which contractors can't use. Ask for an access key instead, store it in the Keychain behind a `credential_process` helper, and skip the client's SSO login task.
- **`default` profile reaching the wrong account.** A command without a profile can reach an unrelated account. Always set the profile explicitly and say so in `AGENTS.md`.
- **Creating a key in the console.** Confirm the console identity is the user's own IAM user in the right account before creating a key; download the CSV to a private temp folder, import it into the Keychain without printing, delete the file, confirm with `sts get-caller-identity`.

## Agents and Kernel

- **Kernel hooks missing from `hooks.json`.** Another hook installer (ai-memory) rewrote `hooks.json` and dropped Kernel's eight hooks; Kernel reports "Review the eight Kernel hooks". Check the hooks file of the `CODEX_HOME` the companion actually runs under. Fix: back up `hooks.json`, run `krnl connect codex` with that `CODEX_HOME`, then the user approves them with `/hooks`.
- **Companion running under the wrong `CODEX_HOME`.** The remote companion's tmux server had `CODEX_HOME` in its global environment, so every restart inherited a different account. Check `tmux -L kernel-companion show-environment -g`. Fix: unset it there and restart only the Codex companion.
- **Model missing from one account.** Different Codex accounts list different models; a mapping fails if the host doesn't offer the model. Check the host's model catalog in Kernel's Codex settings before creating a mapping.
- **Remote Codex project only on the client side.** Adding a remote project in the Mac's Codex app saves it in the app's own list, not on the remote's Codex server, so Kernel can't map it. Create it on the remote with `project/create` and remove any client-side duplicate.
- **New project folder needs hook approval.** Kernel returns `codex_project_unavailable` until the user approves the hooks in that folder with `/hooks`.
- **Mapping points at a deleted saved project.** Recreating a T3 or Codex project gives it a new id; repoint the Kernel mapping (a remote T3 mapping once kept the old id this way).
- **T3 host "not responding" in Kernel.** Check `krnl status` and the T3 companion before writing T3 mappings; never restart the T3 server you are running in. On 2026-10-18 the cause was a protocol change: the T3 fork merged upstream v0.1.0 (server 0.0.45), which requires an `x-t3-orchestration-protocol: 2` header that krnl 0.3.2's companion doesn't send, so its requests get HTTP 400. Test with the companion's own session token, with and without the header. Repair commands and restarts don't help; the companion needs a code fix (`packages/codex-companion/src/t3code/local.ts` in the Kernel repo) and a new krnl release.

## Gateways

- **Owner-only `.devcontainer` file modes.** If a checkout's `.devcontainer` files are 700/600, the container user can't read them and `doctor` fails with `post-create.sh: Permission denied`. Reset to the modes Git records (755 for scripts, 644 otherwise); Git shows no diff.
- **Gateways that take tokens instead of a login.** Some gateways refuse `vercel login` and read tokens from `.devcontainer/secrets.env` (mode 600). Setting one up on a second machine means creating that file there; the user copies the values, the agent never does.
- **Google login callback on the remote.** `gws` login redirects to a localhost port on the remote; forward it with `ssh -L <port>:127.0.0.1:<port>`.
- **Gateway links don't sync between machines.** Run `install-host-command.sh` on each machine; check `~/.local/bin` on both in the audit.
