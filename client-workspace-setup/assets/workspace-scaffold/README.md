# {{CLIENT_NAME}} Development Workspace

{{OWNERSHIP_SENTENCE}} It tracks workspace orchestration and documentation only. Every project directory is an independent Git repository with its own history, branches, remotes, and review workflow.

## Quick start

```bash
git clone {{WORKSPACE_REPO_URL}} {{SLUG}}
cd {{SLUG}}
gh auth login
gh auth setup-git
./scripts/bootstrap.sh
```

The GitHub CLI steps are needed only when the machine does not already have GitHub credentials that can read {{GITHUB_ORG}}'s private repositories. The bootstrap script requires only Git and Bash.

| Machine | Path |
| --- | --- |
| MacBook | `{{MAC_PATH}}` |
| Remote (`sim.agents.hoptech.ca`) | `{{REMOTE_PATH}}` |

## Toolchain

TODO(setup): how each child installs its toolchain and dependencies on the host (mise, fnm, pnpm, bun, uv, ...), any workaround with its reason, local port overrides, and how to run the local stack. Delete this paragraph when filled.

## Routine updates

The root and child repositories are updated separately:

```bash
# Update workspace orchestration and documentation.
git pull --ff-only

# Clone missing child repositories.
./scripts/bootstrap.sh

# Fetch every child and fast-forward eligible default branches.
./scripts/bootstrap.sh --pull

# Inspect all children without fetching or changing them.
./scripts/bootstrap.sh --status
```

Bulk pull fast-forwards a child only when its `origin` matches `repos.yaml`, its worktree is clean, it is on the branch declared in `repos.yaml`, and it has not diverged from that branch on `origin`. It never switches branches, stashes, rebases, merges, resets, or rewrites remotes. It exits with code `2` when a repository was safely skipped and `1` for validation, authentication, clone, fetch, or repository errors.

## Repositories

`repos.yaml` is the source of truth for clone URLs, local folder names, and default branches.

<!-- repositories:start -->
| Local folder | Repository | Default branch | Purpose |
| --- | --- | --- | --- |
{{README_REPO_ROWS}}
<!-- repositories:end -->

A child folder may be a symlink to a clone kept elsewhere; bootstrap and validation follow it.

## Repository boundaries

The outer repository ignores every child folder. Run Git commands from the workspace root only for workspace files such as `README.md`, `repos.yaml`, `AGENTS.md`, scripts, CI, and `.devcontainer/`. Run Git commands from inside a child directory for project work.

This workspace is not a monorepo and does not use Git submodules. A child repository's current commit is not pinned by the root.

Task worktrees live under `.worktrees/<task>/`, which the root ignores.

## Adding, renaming, or removing a project

Keep the workspace surfaces synchronized in one root commit:

1. Update `repos.yaml`.
2. Update the repository table above.
3. Update the project list in `AGENTS.md`.
4. Add the folder to `.gitignore`.
5. Run `./scripts/validate-workspace.sh` and `./tests/bootstrap.sh`.

## Validation

```bash
./scripts/validate-workspace.sh
./tests/bootstrap.sh
```

Validation checks manifest structure, documentation consistency, ignore rules, unresolved setup placeholders, shell syntax, and the outer Git tracking boundary. The bootstrap fixture tests create temporary local repositories, so they never touch the real repositories.
