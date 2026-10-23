# AGENTS.md

{{AGENTS_INTRO}}

## Subdirectories

{{AGENTS_REPO_BULLETS}}

Before working inside a child, read its own `CLAUDE.md` and `AGENTS.md` and follow them. They take precedence over this file for anything inside that repository.

## Toolchain

TODO(setup): host toolchain per child, how to run commands (for example `mise exec --`), and documented workarounds with their reason. Delete this section if there is nothing beyond the children's own docs.

## Pull requests

TODO(setup): who merges, whether a merge to the default branch deploys, branch and ticket naming, PR title format, and anything we must never do (push to main, force-push, `--no-verify`). Delete this section only if the workspace has no review rules beyond the children's docs.

## Data and privacy

TODO(setup): data sensitivity (PHI, PII, payments, customer data), where query output may be saved (`outputs/` only), which environments are test surfaces. Delete this section if the client has no sensitive data.

## Provider CLI gateway

TODO(setup): load the `provider-cli-container` skill and name the gateway command, where it lives, its providers, pinned accounts and targets, and which commands need the user's go-ahead. State that host-global profiles and `gswitch` are not used for this client. Record any host-side exception (a provider the client's own tooling must reach from the host) and its reason.

## Credentials

TODO(setup): how each credential is stored per machine (gateway volume, Keychain, `secrets.env`), never printed or copied. Delete this section if every credential lives in the gateway.

## Browser Profile

Use the Chrome profile named **{{CHROME_PROFILE}}** for browser work in this workspace. Follow the global web-computer-use reservation and authentication rules, and verify the signed-in account before mutations.

## Skill accounts

TODO(setup): account aliases for authenticated skills (for example Asana `<alias>`, GoDaddy `<alias>`). Delete this section if none apply.

## Workspace repository

This directory is the `{{WORKSPACE_REPO_SLUG}}` meta-repository. It tracks only workspace files (`AGENTS.md`, `README.md`, `repos.yaml`, scripts, CI, `.devcontainer/`); {{CHILD_LIST_INLINE}} stay independent Git repositories ignored by the root. Run Git commands for project work inside each child, do not stage child files from the root, and do not add children as submodules or gitlinks.

- `./scripts/bootstrap.sh` clones missing children; `--pull` fast-forwards only safe, clean default branches; `--status` reports without changing anything.
- `./scripts/validate-workspace.sh` and `./tests/bootstrap.sh` check the manifest, docs, ignore rules, and Git boundaries.
- Task worktrees go under `.worktrees/<task>/`.
- When adding, renaming, or removing a project, follow "Adding, renaming, or removing a project" in `README.md`.
