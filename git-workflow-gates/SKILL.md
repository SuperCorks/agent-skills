---
name: git-workflow-gates
description: Pre-implementation branch-state checks and post-documentation PR gate workflow for multi-repo workspaces.
---

# Git Workflow Gates

## When to use
- Before implementation to validate branch/repo readiness.
- After docs completion to create or verify PRs.
- In multi-repo workspaces requiring coordinated status reporting.

## Inputs expected
- Affected repositories and files from plan.
- Current stage: `pre-implementation` or `post-documentation`.

## Workflow
1. Pre-implementation gate:
- Identify each affected repo.
- Determine base branch (`develop` if present, else `main`).
- Verify current branch is not protected base.
- Verify feature branch is up-to-date with base.

2. Post-documentation gate:
- Ensure changes are committed.
- Create PR for each affected repo or report existing PR URL.

3. Report gate outcome:
- Ready vs HALT per repo with explicit corrective commands.

## Output format (evidence required)
- Stage and affected repositories.
- Per-repo branch/base/status summary.
- Required corrective actions (commands), if halted.
- PR URLs created or already existing (post stage).

## Quality gate / halt conditions
- Halt on protected branch usage, dirty tree (when blocking), or behind-base status.
- Do not force-push without explicit user direction.
