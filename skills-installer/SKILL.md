---
name: skills-installer
description: Install, update, list, or remove supercorks agent skills and subagents with the @supercorks/skills-installer CLI in non-interactive mode. Use when the user asks to add, remove, sync, or update skills or agents for Claude, Codex, or Copilot, or asks which skills are installed where. Not for authoring or editing a skill's content.
---

# Skills Installer

Manage skill and subagent installations with `npx @supercorks/skills-installer@latest` using flags only. Never start the interactive wizard: without a terminal it exits with code 2, and it cannot be driven through piped input.

Requires Node.js 18+ and git. The GitHub API is used to list what is available; an authenticated `gh` CLI or `GITHUB_TOKEN` avoids rate limits.

## Workflow

1. **Inspect first.** Run `--list --json` and read it before changing anything.
2. **Choose the target from the report.** `--path` is required; never guess it. Match the harness the user named (`claude`, `copilot/codex`, `codex`) and the scope they want (`global` under `~`, `local` in the current project). When several targets fit, for example `~/.claude/skills/` and a `~/.claude_*/skills/` profile, ask which one. Local paths resolve against the current directory, so run from the project root.
3. **Preview with `--dry-run`** when removing, using `--exact`, or touching more than one target.
4. **Apply with `--json`** and check `ok` and each result's `action`.
5. **Report** what was added, removed, or left unchanged, and tell the user that newly installed skills load in a new agent session.

```bash
CLI="npx --yes @supercorks/skills-installer@latest install"

$CLI --list --json
$CLI --yes --skills frontend-design,feature-dev --path ~/.claude/skills --json
$CLI --yes --agents Architect,Tester --agents-path ~/.claude/agents --json
$CLI --yes --remove-skills boulevard --path ~/.claude/skills --json
$CLI --yes --update --path ~/.claude/skills --json
$CLI --yes --update --all --json
```

## Flags

| Flag | Behaviour |
|------|-----------|
| `--list` | Read-only. Available skills and agents, plus every install target with `exists`, `installed`, `updates`, and `dirty` |
| `--skills <a,b\|all>` | Add skills by folder name |
| `--agents <a,b\|all>` | Add agents. `Architect`, `code-quality`, and `Code Quality.agent.md` all resolve |
| `--remove-skills`, `--remove-agents` | Remove only the named items |
| `--exact` | Make the given list the full installed set. Everything else at that target is removed |
| `--path <dir>` | Target, repeatable. Skills target, or the agents target when only agents change |
| `--agents-path <dir>` | Agents target, repeatable. Required when skills and agents change in one command |
| `--update` | Pull the latest version at the given paths. `--all` refreshes every detected installation |
| `--dry-run` | Report the plan without touching disk |
| `--gitignore` | Add a new local install path to `.gitignore` |
| `--json` | One JSON document on stdout. Progress goes to stderr, so parse stdout only |

Selection is additive. `--skills` and `--agents` never remove anything, and a target that already has the requested items is reported as `unchanged` without pulling unless `--update` is passed. Use `--exact` only when the user asked for an exact set, and show them the dry run first.

Codex agent targets (`.codex/agents/`) receive converted TOML files through the same flags.

## Output

Success:

```json
{
  "ok": true,
  "dryRun": false,
  "results": [
    {
      "kind": "skills",
      "path": "~/.claude/skills",
      "absolutePath": "/Users/me/.claude/skills",
      "action": "updated",
      "added": ["feature-dev"],
      "removed": [],
      "notInstalled": [],
      "installed": ["frontend-design", "feature-dev"]
    }
  ]
}
```

`action` is `installed`, `updated`, `unchanged`, `would-install`, or `would-update`. `notInstalled` lists removal names that were not present.

Failure, on stdout with a non-zero exit code:

```json
{
  "ok": false,
  "error": {
    "code": "UPDATE_FAILED",
    "message": "Could not update sparse checkout from origin/main. ...",
    "path": "~/.claude/skills",
    "dirty": ["frontend-design"],
    "completed": []
  }
}
```

## Handling failures

| Exit | Code | What to do |
|------|------|------------|
| 2 | `USAGE` | Fix the flags. The message names the problem |
| 2 | `UNKNOWN_ITEM` | The name does not exist. `error.available` lists valid names; pick the intended one or ask |
| 2 | `EMPTY_SELECTION` | The change would remove everything. Confirm with the user; removing an installation means deleting its directory, which is their call |
| 1 | `NOT_INSTALLED` | Nothing is installed at that path. Re-check the target with `--list` |
| 1 | `NOT_AN_INSTALLATION` | The path is some other git repository. Choose a different path; never point the installer at a project root |
| 1 | `UPDATE_FAILED` | Local edits or diverged history block the pull. `error.dirty` names the items |
| 1 | `INSTALL_FAILED`, `GIT_UNAVAILABLE` | Network, GitHub, or git problem. Report the message |

With several targets the run stops at the first failure, and `error.completed` lists the targets already changed.

On `UPDATE_FAILED`, stop and report. Installations are git checkouts that users edit in place, so dirty items are usually unpublished work. Do not stash, reset, check out, or delete to make the update pass unless the user explicitly asks; offer to show the diff or to commit and push the changes instead.
