---
name: client-workspace-setup
description: Set up a new client or project workspace end to end across Simon's MacBook, the remote host, T3 Code, Codex, Chrome, provider CLI gateways, and Kernel, or audit an existing workspace against that standard and list or fix its gaps. Use when onboarding a new client, adding a project, machine, or agent to an existing client, or checking that a client's setup is complete; not for project feature work or for building a gateway alone (use provider-cli-container).
---

# Client Workspace Setup

Set up a client the way Simon's existing workspaces are set up, so any agent on either machine lands in the right folder, with the right accounts, from Kernel.

Examples in this skill use the placeholder client `acme` (Acme Health). The real client roster, accounts, and past decisions live in `clients.local.md` beside this file: see [Private client notes](#private-client-notes).

## Modes

- **Setup**: a new client or project. Run every phase in order.
- **Extend**: add a repo, machine, agent, or Kernel project to an existing client. Run intake for the delta, then only the phases it touches, then the audit.
- **Audit**: check an existing client against [references/audit.md](references/audit.md). Report gaps first; fix only what the user approves.

## Rules

- **Intake first.** Ask the questions in [references/intake.md](references/intake.md), prefilled with what you can discover (Kernel, GitHub, existing folders). Show the intake summary and get confirmation before the first change. Ask, never assume, for: workspace repo owner, local path, gateway placement, remote Codex naming, workspace-specific tooling.
- **Discover, then decide.** Read the client's repos (README, `AGENTS.md`/`CLAUDE.md`, toolchain files, CI, onboarding docs, the repo's own agent skills and hooks) before writing anything. Kernel notes are often wrong about repo count.
- **Back up before editing** any file outside a git repo: `<file>.bak-<YYYY-MM-DD>` (add `-HHMMSS` if one exists). Never stop another client's containers or services to free a port.
- **Secrets never enter chat or logs.** They come through a browser download imported straight into the Keychain, a terminal prompt the user types into, or a native CLI login. Print names, never values.
- **No outbound messages.** Draft requests to the client (access, keys, invites) and give the exact channel or thread; the user sends them.
- **Kernel pages** (Overview, LLM.txt, People/Dates/Resources): show drafts and get approval before writing, per the Kernel presets in AGENTS.md. Mappings and saved projects are part of the setup the user approved in intake.
- **Git**: the workspace repo is created and pushed as part of setup. Never commit to, push to, or change branches in a child repo.
- **Never restart the T3 Code server on the machine you are running in.** Restart only Kernel companions, one at a time, and only when a check says so.
- **Pause for the user** at the steps only they can do, listed in each phase as "User step". Batch them so the user does several at once, with exact commands.

## Phases

### 0. Intake
Run [references/intake.md](references/intake.md). Output: the intake summary (client, slug, emoji, owner, paths, repos, providers and accounts, Chrome profile, Kernel org/projects, machines, agents, rules). Confirm it.

### 1. Access and discovery
- GitHub: the invite is accepted under the account the user named; `gh api` shows the role and push rights on every in-scope repo, on both machines.
- Read every in-scope repo. Record: toolchain, how to install and test, local stack and seeds, auth for local login, branch/PR/ticket naming, who merges, whether merge deploys, protected branches, data sensitivity, provider CLIs the repo already calls (affects gateway naming and placement).
- Check gateway name collisions against names the repos already use (if a repo already uses `acme-dev` as an AWS profile, name the gateway `acme-health-dev`).
- For a non-trivial client, write a short design note (repos, risks, blockers, open questions) and attach it to the setup task in Kernel.

### 2. Workspace repo
- Render the scaffold with [scripts/init_workspace.py](scripts/init_workspace.py) (run `--help`; it refuses to overwrite). Omit `--repo` when no child repository exists yet (for example a hosted CMS site whose theme repo comes later); the manifest is then `repositories: []`, which bootstrap and validation accept. It writes `repos.yaml`, `README.md`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`), `.gitignore`, `.ai-memory.toml`, `scripts/bootstrap.sh`, `scripts/validate-workspace.sh`, `tests/bootstrap.sh`, and the CI workflow.
- Fill or delete every `TODO(setup)` block; validation fails until you do. Section guidance: [references/conventions.md](references/conventions.md#agentsmd).
- No `.code-workspace` file.
- If the repo lives on the client's GitHub org, keep Simon's machine paths, other clients, and personal accounts out of it: they go in the private host map.
- Add workspace-specific tooling only when the intake says so (for example a per-task worktree and port script, an exact-SHA CI wait script, a Windows `bootstrap.ps1`). Worktrees always go under `.worktrees/<task>/`.
- Create the GitHub repo (private) where intake said, push, and confirm CI passes.

### 3. MacBook
- Clone the workspace to the intake path, run `./scripts/bootstrap.sh`.
- Install each child's toolchain and dependencies on the host the way its docs say; run a sample of tests and a build. Record workarounds in README and `AGENTS.md`.
- Known traps: [references/known-issues.md](references/known-issues.md) (npm token leaking to other registries, port clashes, stray config files picked up by mise).
- Codex trust: add the workspace root and each child to `~/.codex/config.toml` (`[projects."<abs path>"] trust_level = "trusted"`).
- Skill account aliases (`*_ACCOUNTS` in `~/.zshrc`, Keychain-backed where the others are) only for skills the client needs.

### 4. Provider CLI gateway
- Ask where the gateway goes: one per client at the workspace root, inside one child repo, or one per repo (past choices are in `clients.local.md`). Load `provider-cli-container` and follow it.
- Put every provider the client needs behind the gateway, with the expected account and target pinned: gh, gcloud/bq, gws, Vercel, EAS, Supabase, PostHog, Shopify, Cloudflare, npm, AWS. npm and AWS are not in the scaffold yet; add them following its pattern.
- Host-side exception only when the client's own tooling must reach a provider from the host (a git hook that calls AWS, a script using an SDK such as boto3, an MCP server). Use a named profile, never `default`, and record the exception and its reason in `AGENTS.md`.
- Install with `install-host-command.sh`, run `<cmd> doctor` and the gateway tests, add the tests to workspace CI.
- **User step:** native login for each provider, on the Mac. Then verify with the gateway's `status`.

### 5. Chrome profile
Check the client's profile per [references/machine-wiring.md](references/machine-wiring.md#chrome): BrowserSkill, Web Computer Use, ChatGPT, Keeper installed; ChatGPT has "Allow access to file URLs" on and its optional `downloads.open` permission granted. Add a Raycast launcher `~/.raycast-scripts/chrome-<client>.sh` if intake asked. Refresh the BrowserSkill profile cache.
- **User step:** create the profile, install missing extensions, and toggle settings the agent can't reach. Computer Use can do it with the user's go-ahead: offer a ready-to-run Codex prompt.
- ProfileRouter (`~/supercorks/profile-router`) picks the new profile up from Chrome on its own. Add rules only for hosts the client alone uses (its own domains, a client-only SaaS); leave shared hosts (WP Engine, Google Docs, GitHub) to the picker. Follow that repo's `AGENTS.md`: `swift test` (it replays the live log), `swift run replay --conflicts`, `scripts/install.sh`, then commit on a branch. See [machine-wiring.md](references/machine-wiring.md#profilerouter).

### 6. Remote host (`sim.agents.hoptech.ca`)
Load `remote-hosts`. Then:
- Clone the workspace to `/workspaces/<slug>`, bootstrap, install the same toolchain and dependencies, run the same smoke tests.
- Install the gateway (`install-host-command.sh`, `doctor`, tests). **User step:** log in to it on the remote too.
- Host-side credentials get their own per-machine key (no Keychain on the remote: `~/.aws/credentials` mode 600 or `~/.config/agent-env/secrets.env`).
- Register the workspace in `/workspaces/WORKSPACES.md` and in `hosts.local.md` (Project paths, Repository inventory, a dated client section), then `scripts/sync-hosts-map.sh push`.
- Codex trust on the remote, as on the Mac.

### 7. Agent projects
Per [references/machine-wiring.md](references/machine-wiring.md#agent-projects):
- T3 Code: `t3cork project add <path> --title <title>` on each machine with that machine's bundled CLI. **User step:** set the icon in the app.
- Codex, Mac: **User step:** add the project in the Codex app (emoji + name). Then read its id.
- Codex, remote: create it on the remote's Codex server with [scripts/codex-appserver.mjs](scripts/codex-appserver.mjs) (`project/create`). Ask whether the remote name gets the emoji.
- Folders that aren't git repos (docs-only clients) have no clean way onto the remote: ask whether to copy them, sync them, or keep the client Mac-only.

### 8. Kernel organization and projects
Load `kernel`. Create or update the org (name, slug, key prefix, avatar, billing) and any Kernel projects, then draft Overview, LLM.txt, and the People, Dates, and Resources tabs in the formats in [references/conventions.md](references/conventions.md#kernel-pages). Get approval, then write them. Set the master payer when the client is billed through an agency (Red Krypton clients sit beneath Red Krypton) with `PATCH /organizations/{id}/payer`.

Then wire the client's tracking into Kernel ([machine-wiring.md](references/machine-wiring.md#kernel-asana-and-toggl)):
- **Asana**: if the client has an Asana project, make sure the right connection tracks it, add a `route` rule to the org (and project), and map its sections to Kernel statuses. Link any Kernel task you created that duplicates an Asana task assigned to Simon, so routing doesn't import it twice.
- **Toggl**: map the org (or each project, when they have separate Toggl projects) to the client's Toggl project.

### 9. Kernel preflight and mappings
Preflight each machine before any mapping write ([references/machine-wiring.md](references/machine-wiring.md#kernel-preflight)): companion connected under the expected `CODEX_HOME` and account, all Kernel hooks present and trusted, target model in the host catalog, T3 host reachable. If a T3 host is unreachable, save the mapping request bodies under `~/.local/state/client-workspace-setup/pending-mappings/` and create them once it's back.

Then create the mappings the intake chose (default: T3 Code and Codex on MacBook and Remote, at org level, `folder` checkout) with the defaults in [references/conventions.md](references/conventions.md#mapping-defaults).

### 10. Smoke test
Launch one small task through each mapping (ask first: it starts real threads) and confirm each opens in the right folder on the right machine.

### 11. Record and hand off
- Work note on the setup task: what's in place, what changed outside the workspace (with backup paths), what's blocked on the client, the user's remaining steps.
- Update the client's LLM.txt and Resources tab if facts changed (with approval).
- Run the audit and report its result.

## References

- [references/intake.md](references/intake.md): intake questions and the summary template.
- [references/conventions.md](references/conventions.md): paths, ownership, naming, `AGENTS.md` sections, Kernel page formats, mapping defaults.
- [references/machine-wiring.md](references/machine-wiring.md): exact commands for T3 Code, Codex, Kernel, Chrome, and the remote host.
- [references/known-issues.md](references/known-issues.md): problems hit in past setups and their fixes.
- [references/audit.md](references/audit.md): the audit checklist.

## Private client notes

Real client names, paths, GitHub orgs, accounts, billing rates, and client-specific fixes live in `clients.local.md` beside this file. Read it during intake to prefill answers and to reuse past decisions. Resolve the path relative to the loaded skill and follow symlinks. The bundled `.gitignore` excludes it and same-prefix backups: never force-add it or copy its contents into public files, client workspace repos, examples, or PR descriptions. If it is missing, say so and continue with the placeholders.

Each machine keeps one real copy at `~/.agents/skills/client-workspace-setup/clients.local.md`; every other skills folder on that machine symlinks its `clients.local.md` to it. When setup or an audit teaches something client-specific, add it there, not to the public references.
