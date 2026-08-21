---
name: asana-writer
description: Create and update Asana projects, sections, tasks, subtasks, comments, assignments, dates, completion state, placement, dependencies, tags, and task custom-field values with multi-account support. Use when a user explicitly asks to write, organize, or change work in Asana. Do not use for deletions, archival, or workspace administration.
---

# Asana Writer

Use the executable commands in this skill for explicit Asana write requests. Use `asana-reader` for general investigation that does not require these discovery commands.

## Safety and targeting

- Treat the user's requested write as authorization for that exact mutation. Routine commands execute immediately; add `--dry-run` when a preview is useful.
- Never guess an account, workspace, project, section, task, user, tag, or custom-field GID. Run a discovery command or stop if targeting remains ambiguous.
- Pass `--account NAME` whenever `ASANA_ACCOUNTS` contains multiple aliases.
- Creation commands reject exact-name duplicates in the selected project, section, parent, or workspace unless `--allow-duplicate` is present.
- Do not retry failed writes automatically. Re-read the resource before manually retrying an uncertain write.
- This skill intentionally has no delete, archive, comment-edit, tag-create, custom-field-create, or membership-management command.

## Setup

```bash
cd ~/.agents/skills/asana-writer
npm install
```

Authentication uses the same environment variable as `asana-reader`:

```bash
export ASANA_ACCOUNTS='{"personal":"0/token","work":"0/token"}'
```

All commands emit JSON. Errors go to stderr as structured JSON and never include tokens. Every command supports `--help`; every write command supports `--dry-run`.

## Discover targets

```bash
node scripts/list-accounts.js
node scripts/verify-access.js --account work
node scripts/list-workspaces.js --account work
node scripts/list-teams.js --workspace WORKSPACE_GID --account work
node scripts/list-projects.js --workspace WORKSPACE_GID --account work
node scripts/list-sections.js --project PROJECT_GID --account work
node scripts/list-users.js --workspace WORKSPACE_GID --query "Megan" --account work
node scripts/list-tags.js --workspace WORKSPACE_GID --account work
node scripts/list-custom-fields.js --project PROJECT_GID --account work
```

Use user, tag, field, and enum-option GIDs from discovery output. Assignments accept a user GID or `me`.

## Write projects and sections

```bash
node scripts/create-project.js --workspace WORKSPACE_GID --team TEAM_GID --name "Launch" --account work
node scripts/update-project.js --project PROJECT_GID --name "Launch plan" --due-on 2026-09-30 --account work
node scripts/create-section.js --project PROJECT_GID --name "In progress" --account work
node scripts/update-section.js --section SECTION_GID --name "Doing" --account work
node scripts/move-section.js --project PROJECT_GID --section SECTION_GID --before OTHER_SECTION_GID --account work
```

Organization workspaces require `--team` when creating a project. `move-section.js` accepts exactly one of `--before` or `--after`.

## Write tasks

```bash
node scripts/create-task.js --project PROJECT_GID --section SECTION_GID --name "Draft copy" --assignee me --due-on 2026-09-15 --account work
node scripts/create-task.js --parent TASK_GID --name "Review draft" --account work
node scripts/update-task.js --url "https://app.asana.com/0/PROJECT/TASK" --complete --account work
node scripts/update-task.js --id TASK_GID --unassign --clear-due --account work
node scripts/move-task.js --id TASK_GID --project PROJECT_GID --section SECTION_GID --at-start --account work
node scripts/set-task-tags.js --id TASK_GID --add TAG_GID,OTHER_TAG_GID --remove OLD_TAG_GID --account work
node scripts/set-task-dependencies.js --id TASK_GID --add BLOCKER_GID --remove OLD_BLOCKER_GID --account work
node scripts/add-comment.js --id TASK_GID --text "Ready for review." --account work
```

Task targets accept exactly one of `--id` or `--url`. Creating a task requires `--name` and one of `--project`, `--parent`, or `--workspace`; `--section` also requires `--project`. Moving a task accepts one of `--before`, `--after`, `--at-start`, or `--at-end`.

## Complex data

Create and update commands accept either `--data-json JSON` or `--data-file PATH` for supported API field names. These are mutually exclusive, and a field may not be supplied both as a scalar flag and in the data object.

Supported project fields are `name`, `notes`, `html_notes`, `color`, `public`, `start_on`, `due_on`, `owner`, and `team` on creation. Supported task fields are `name`, `notes`, `html_notes`, `assignee`, `followers`, `due_on`, `due_at`, `start_on`, `start_at`, `completed`, `resource_subtype`, and `custom_fields`.

Example custom fields:

```bash
node scripts/update-task.js --id TASK_GID \
  --data-json '{"custom_fields":{"FIELD_GID":"ENUM_OPTION_GID"}}' \
  --account work
```

Date-only fields use `YYYY-MM-DD`; timestamps must be ISO 8601. Use `--clear-due`, `--clear-start`, and `--unassign` for explicit clearing. Milestones cannot have start dates.

## Output contract

Discovery output contains `metadata` and the requested resource collection. Write output contains:

- `metadata`: timestamp, account alias, and dry-run state
- `operation`: command name
- `before`: prior resource for updates
- `requested`: validated intended mutation
- `changed`: changed field names or relationship operations
- `result`: verified post-write resource, or the predicted result for a dry run

## Official references

- [Tasks](https://developers.asana.com/reference/createtask)
- [Task updates](https://developers.asana.com/reference/updatetask)
- [Projects](https://developers.asana.com/reference/createprojectforworkspace)
- [Sections](https://developers.asana.com/reference/createsectionforproject)
- [Comments](https://developers.asana.com/reference/createstoryfortask)
- [Custom fields](https://developers.asana.com/docs/custom-fields-guide)
- [Rate limits](https://developers.asana.com/docs/rate-limits)
