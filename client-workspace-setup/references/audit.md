# Audit

Check one client, or every client, against the standard. Read-only until the user approves fixes. Report a table per client: check, Mac, Remote, finding, proposed fix.

To audit everything, enumerate clients from Kernel organizations and their mappings, and from `~/.t3-fork` and `~/.codex` saved projects on both machines; flag any folder that has saved projects but no Kernel mapping, and any mapping whose saved project no longer exists.

## Checklist

**Workspace repo**
- Root is a git repo whose `origin` matches `repos.yaml` `workspace_repository`; the saved projects point at the root itself, not a parent folder.
- `./scripts/validate-workspace.sh` and `./tests/bootstrap.sh` pass; `./scripts/bootstrap.sh --status` shows every child cloned, on its branch, origin matching.
- No `.code-workspace` checks left in the validator (older template).
- `CLAUDE.md` is `@AGENTS.md`; `AGENTS.md` has the always-present sections from [conventions.md](conventions.md#agentsmd); `.ai-memory.toml` present.
- Worktrees under `.worktrees/<task>/` and ignored.
- If on the client's org: no personal paths, accounts, or other clients in it.

**Gateway**
- Linked in `~/.local/bin` on each machine where the workspace exists; `<cmd> doctor` passes; `status` shows the expected account and target per provider.
- Gateway tests in workspace CI.
- Every provider the client uses goes through it, or the host-side exception is documented in `AGENTS.md`.

**Machines**
- Remote checkout at `/workspaces/<slug>` with children cloned, toolchain installed, smoke tests passing, credentials present if intake asked for them.
- Codex trust in `~/.codex/config.toml` for the root and each child, both machines.
- `/workspaces/WORKSPACES.md` row and `hosts.local.md` entries present; the host map is in sync (`sync-hosts-map.sh status`).

**Chrome**
- Profile exists with BrowserSkill, Web Computer Use, ChatGPT, Keeper; ChatGPT file URL access on and `downloads.open` granted.
- `AGENTS.md` Browser Profile section names it.

**Agent projects and Kernel**
- T3 Code project on each machine, with an icon.
- Codex project on each machine (remote one on the remote's server), named per convention.
- Kernel org (and projects) with Overview, LLM.txt, People, Dates, Resources; LLM.txt paths match reality.
- Mappings for every agent and machine the intake chose, pointing at saved projects that exist, with the defaults or a recorded reason for deviating.
- Kernel machine health: reachable, hooks ready, no issue, model available.
