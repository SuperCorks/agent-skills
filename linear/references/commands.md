# Helper commands

Use `node scripts/linear.mjs --help` or `COMMAND --help` for the exact supported flags. No dependency installation is needed. Values containing spaces must be shell-quoted; prefer Markdown files for descriptions, content, and comments.

All network commands accept `--account ALIAS` and an optional read guard `--workspace UUID`. Writes require `--workspace`. JSON goes to stdout on success (`ok: true`), structured errors go to stderr with a nonzero exit. Errors omit credentials and raw API response messages.

## Reads

| Command            | Targets and filters                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`         | List configured aliases without making network requests or exposing credentials                                                                                      |
| `verify`           | Read viewer and workspace identity                                                                                                                                   |
| `teams`            | Team UUIDs, keys, names                                                                                                                                              |
| `users`            | Optional `--query` matches user name or email                                                                                                                        |
| `states`           | Optional `--team UUID`; issue states include type and team                                                                                                           |
| `labels`           | Optional `--team UUID` includes that team's and workspace-wide labels                                                                                                |
| `cycles`           | Optional `--team UUID`; cycle names, numbers, dates, and teams                                                                                                       |
| `project-statuses` | Project statuses and their types, separate from issue workflow states                                                                                                |
| `projects`         | Optional `--team UUID`, `--query NAME` (name contains, case insensitive)                                                                                             |
| `project`          | `--project UUID`; full project content, status, lead, dates, and team page                                                                                           |
| `issues`           | Optional `--query TEXT` full-text search, `--team UUID`, `--project UUID`, `--state UUID`, `--assignee UUID\|me`, `--priority 0..4`, `--updated-since ISO_TIMESTAMP` |
| `issue`            | `--issue UUID\|TEAM-123\|URL`; issue description, workflow, ownership, project, cycle, parent, labels, and sub-issue page                                            |
| `comments`         | `--issue UUID\|TEAM-123\|URL`; comment body, author, timestamps, and URL                                                                                             |

Collections accept `--limit 1..100`, `--after CURSOR`, and `--all`. The limit is per page; `--all` stops after 100 pages and retains a continuation cursor when more remain. Ordinary issue lists sort by most recently updated; full-text search keeps the API's relevance order. Both filter on the server. Querying `--priority 0` means no priority, not urgent. Archived records are not explicitly requested.

## Issues

`create-issue` requires `--team UUID --title TEXT`. Optional fields:

- `--description TEXT` or `--description-file PATH` (Markdown).
- `--state UUID`, `--assignee UUID|me`, `--project UUID`, `--cycle UUID`, `--parent ISSUE_UUID`.
- `--priority 0..4`: none, urgent, high, medium, low respectively.
- `--estimate INTEGER`: use the team's configured estimate scale; do not invent an estimate.
- `--due YYYY-MM-DD`, `--labels UUID,UUID`.

Without a state, Linear selects its normal default (backlog or triage). Discover the team's states before explicitly selecting one. An issue's parent flag requires the parent's UUID from `issue` output.

`update-issue` requires `--issue UUID|TEAM-123|URL` and at least one field above, except `--team`. It preserves omitted fields; it does not move issues between teams.

- `--labels` replaces the entire label set. Use `--add-labels UUID,UUID` / `--remove-labels UUID,UUID` for incremental changes instead. These cannot be combined with replacement/clearing.
- `--clear assignee,project,cycle,parent,due,estimate,labels,description` clears only the comma-separated fields named. A field cannot also be set in that invocation. Use `--priority 0` to clear priority.

Both support `--dry-run`; creation alone supports `--allow-duplicate` after inspecting an existing same-title issue in the selected team. Preflight duplicate checks do not prevent simultaneous creates.

## Projects

`create-project` requires `--teams UUID,UUID --name TEXT`. Optional fields:

- `--description TEXT` / `--description-file PATH` for the project summary.
- `--content TEXT` / `--content-file PATH` for full Markdown content.
- `--status PROJECT_STATUS_UUID`, `--lead USER_UUID|me`.
- `--start YYYY-MM-DD`, `--target YYYY-MM-DD`.

`update-project` requires `--project UUID` and one or more optional fields above, including `--name`; it preserves team membership. `--clear description,content,lead,start,target` clears only the named fields. Both support `--dry-run`; creation supports `--allow-duplicate` after inspecting an existing same-name project in the workspace.

## Comments

`comment --issue UUID|TEAM-123|URL` requires `--body TEXT` or `--body-file PATH`. It returns the draft and target without writing by default. With explicit user send authorization, `--post` creates the comment. `--dry-run` always prevents posting even if `--post` is supplied. No comment-edit/delete or notification-management command is included.

## Results and failures

Read output identifies the account, workspace, and viewer in `metadata`, plus `result` for details or `nodes`, `pageInfo`, and `complete` for collections. Writes add `operation`, `dryRun`, `before` for updates, `requested`, and the mutation's returned `result` for confirmed writes. Dry runs perform identity/target reads and duplicate checks, with no mutations.

Common errors:

| Code                                             | Next action                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `AUTH_MISSING`, `AUTH_CONFIG`                    | Configure access privately; use only one configuration source                            |
| `ACCOUNT_AMBIGUOUS`, `ACCOUNT_NOT_FOUND`         | Choose a reported alias                                                                  |
| `AUTH_DENIED`                                    | Check account/key scopes/team restrictions; do not switch accounts silently              |
| `WORKSPACE_MISMATCH`                             | Resolve credentials/target mismatch before doing anything else                           |
| `INVALID_INPUT`, `USAGE`                         | Fix flags/IDs; dates must be real date-only values                                       |
| `NOT_FOUND`                                      | Confirm resource and access in the selected workspace                                    |
| `DUPLICATE`                                      | Read the reported match before deciding whether another item is intended                 |
| `RATE_LIMITED`                                   | Respect returned retry/reset metadata; do not loop on writes                             |
| `NETWORK_ERROR`, `API_ERROR`, `INVALID_RESPONSE` | Inspect targeting/current API schema; reads can be retried deliberately                  |
| `WRITE_OUTCOME_UNKNOWN`, `WRITE_NOT_CONFIRMED`   | Re-read first. A write may already have succeeded; never blindly repeat a create/comment |
