# Conventions

Taken from the existing workspaces as of 2026-10-18. Examples use the placeholder client `acme` (Acme Health); the real examples are in `../clients.local.md`. When a client's own setup differs on purpose, keep it and record why in its `AGENTS.md`.

## Paths and ownership

| | Convention | Examples |
| --- | --- | --- |
| Mac, agency client | `~/redkrypton/projects/<slug>` | `~/redkrypton/projects/acme-health` |
| Mac, direct client | the client's own folder; the workspace repo is the project root, never a parent folder above it | `~/acme/workspace` |
| Remote | `/workspaces/<slug>` | `/workspaces/acme-health` |
| Workspace repo owner | ask; usually where the children live | the client's GitHub org; the agency org (Red-Krypton); SuperCorks when we only contribute through PRs or the data is regulated |
| Workspace repo name | `<slug>-workspace`, private | |
| Worktrees | `.worktrees/<task>/` at the workspace root, ignored | |

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Gateway command | `<slug>-dev` | `acme-health-dev` |
| Gateway image / volume | `<slug>-provider-cli:<hash>` / `<slug>-provider-cli-config` | |
| T3 Code project title | the slug or the brand, no emoji (icon set in the app) | `acme-health`, `Acme` |
| Codex project, Mac | `<emoji> <Name>` | `🩺 Acme Health` |
| Codex project, remote | ask: with or without the emoji | |
| Kernel Codex `taskNamePrefix` | the client emoji | `🩺` |
| Chrome profile | the client name | `Acme` |
| Raycast launcher | `~/.raycast-scripts/chrome-<client>.sh` | |
| ai-memory scope | `workspace = "<agency or client>/<slug>"`, `project = "<slug>"` | `redkrypton/acme-health` |
| Backups | `<file>.bak-<YYYY-MM-DD>` or `.bak-<task>-<timestamp>` | |

## repos.yaml

```yaml
version: "1.0"

organization: <GitHub org>
workspace_repository: https://github.com/<owner>/<slug>-workspace.git

repositories:
  - name: <repo name>
    folder: <local folder, may differ from name>
    url: https://github.com/<org>/<repo>
    branch: <default branch>
    description: <one line>
```

## AGENTS.md

Always present:
- **Intro**: whose code it is and how we contribute (PRs only, direct pushes, Lovable publish by Simon).
- **Subdirectories**: one bullet per child with what lives there, then "read the child's `CLAUDE.md` and `AGENTS.md`; they take precedence inside that repo".
- **Provider CLI gateway**: load `provider-cli-container`; command, location, providers, pinned accounts and targets; run `status` first in a session; which writes need the user's go-ahead (production projects: dry-run first); no host profiles or `gswitch` for this client.
- **Browser Profile**: profile name (and `Profile N` directory if known), what's signed in there, follow web-computer-use rules.
- **Workspace repository**: what the root tracks, children ignored, no submodules, never stage child files from the root, bootstrap and validate commands, `.worktrees/<task>/`, the add/rename/remove checklist.

When they apply:
- **Toolchain**: host toolchain (`mise exec --`, fnm, pnpm, bun, uv) and each workaround with its reason (for example a script that runs `bun install` with a clean `HOME`).
- **Pull requests**: never push to main / merge / force-push / `--no-verify` when the client merges; branch and ticket naming; "merge deploys production, open the PR and stop"; PR only when the user asks.
- **Lovable**: push to main, Simon publishes; never rebase published history.
- **Data and privacy**: data class, outputs only under ignored `outputs/`, aggregate-only reporting, which environments are test surfaces, never read `.env*` if the client forbids it.
- **Credentials**: host-side exceptions (named profile, Keychain item, per-machine keys), never print or copy.
- **Skill accounts**: aliases for Asana, GoDaddy, Iterable, etc.
- **Deploy**: how and who.

Keep it short. Facts that belong to one child repo go in that child, not here.

## Kernel pages

**Organization**: name, slug, key prefix, avatar (uploaded favicon or emoji), Overview (`notes`). Billing: Red Krypton clients use the standard agency rate in `../clients.local.md`; direct clients vary (ask). The billing payer is set in the Kernel UI.

**LLM.txt** (about 1–2k characters):
```
# <Client>
<What the client is, and Red Krypton's or Simon's role, in one or two lines.>

## Systems and code
- Workspace: <Mac path> (meta-repo <owner>/<slug>-workspace); read its AGENTS.md first.
- Repos: <child>: <what>; ...  Domains: ...
- Deploy: <route and who>.
- Provider gateway: <command> (<providers>).
- Accounts: Chrome profile <name>; Asana <alias>; <other>.

## Who decides
- <Person>: <what they decide>.

## Guardrails
- <rule>
```
Optional extra sections: `## Measurement and privacy`, `## QA checklists`. A project's LLM.txt uses `## Code`, `## Business rules`, `## Who decides` and adds only what is specific to the project.

**Tabs**, in this order:
- **People**: `| Person | Responsibility / contact |`; split into `## Client team` and `## <Agency>` when useful; end with a "use X for Y" routing line.
- **Dates**: "Reviewed <date>. Dates below are targets…", a `| Date | Milestone |` table, **Current focus**, **Cadence**, then source links.
- **Resources**: `##` groups of bullet links joined with `·`: Communication (client and internal Slack channels, agendas, Asana, Toggl project), Sites and code (production, admin, GitHub, Figma, dashboards), Reference (kickoff recording, proposal, published brief).

## Mapping defaults

| | Codex | T3 Code |
| --- | --- | --- |
| Scope | organization (project when one org has unrelated codebases) | same |
| Machines | MacBook and Remote, one mapping each | same |
| Checkout | `folder` (required when the workspace spans several repos) | `folder` |
| Model | `gpt-6-astra`, reasoning `xhigh` | the default Claude instance in `../clients.local.md`, model `claude-opus-5-5`, options `[{id: effort, value: high}]` |
| Mode | | runtime `full-access` |
| Prefix | client emoji | empty |

`worktree` checkout is used only where the mapped folder is itself a single repo meant for per-task worktrees (for example T3 Code). Values must match what the host currently reports; read existing mappings to copy exact field shapes.

## Remote registry

- `/workspaces/WORKSPACES.md`: one row per workspace in the "Local project | Remote project" table.
- `~/.agents/skills/remote-hosts/hosts.local.md` (private, mode 600): add the client to Project paths and Repository inventory, plus a dated `## <Client> workspace (updated <date>)` section with gateway, secrets, and interim-access notes. Sync with `scripts/sync-hosts-map.sh push`.
