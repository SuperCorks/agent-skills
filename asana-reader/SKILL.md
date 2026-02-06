---
name: asana-reader
description: 'Read Asana tasks by URL, ID, or name search. Fetches task details and comments with multi-account support. Read-only access to Asana workspace data.'
---

# Asana Reader

Read Asana tasks and comments by URL, ID, or name search. This skill provides read-only access to Asana workspace data with support for multiple accounts.

## Overview

Fetches Asana task details given a URL, GID, or search query, including:
- Task metadata (name, notes, assignee, projects, tags, dates)
- Task comments and activity
- Custom fields
- Subtasks and dependencies

## Setup

### Prerequisites
- Node.js 20+
- `asana` package: `npm install asana`

### Environment Variables

```bash
export ASANA_ACCOUNTS='{"personal": "0/abc123def456", "work": "0/xyz789uvw012"}'
```

The `ASANA_ACCOUNTS` variable is a JSON object mapping account names to Personal Access Tokens (PATs).

### Multi-Account Configuration

Configure multiple Asana accounts for different workspaces:

```json
{
  "personal": "0/1234567890abcdef",
  "work": "0/fedcba0987654321",
  "client_a": "0/aabbccdd11223344"
}
```

When multiple accounts are configured, use `--account <name>` to specify which one to use. If only one account is configured, it's used automatically.

### Generating a Personal Access Token

1. Log into Asana
2. Go to **Profile Settings** → **Apps** → **Developer Apps**
3. Or navigate directly to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps)
4. Click **Create new token**
5. Give it a name and click **Create token**
6. Copy the token (starts with `0/`)

⚠️ Tokens grant full access to your Asana account. Keep them secure and never commit them to version control.

## Available Scripts

### read-task.js

Read an Asana task by URL, ID, or name search.

```bash
node scripts/read-task.js [--url URL | --id GID | --name SEARCH] [options]
```

One of `--url`, `--id`, or `--name` is required.

**Options:**

| Option | Description |
|--------|-------------|
| `--url <url>` | Asana task URL |
| `--id <gid>` | Asana task GID (numeric ID) |
| `--name <search>` | Search for task by name (requires `--workspace`) |
| `--account <name>` | Account name from ASANA_ACCOUNTS (required if multiple) |
| `--workspace <gid>` | Workspace GID (required for `--name` search) |
| `--help` | Show help message |

**Output:**

JSON object containing:
- `metadata`: Fetch timestamp, account used
- `task`: Task details (name, notes, assignee, projects, tags, dates, etc.)
- `comments`: Array of comments on the task

### list-projects.js

List Asana projects for a workspace.

```bash
node scripts/list-projects.js [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--workspace <gid>` | Workspace GID (omit to list all workspaces) |
| `--account <name>` | Account name from ASANA_ACCOUNTS (required if multiple) |
| `--archived` | Include archived projects |
| `--help` | Show help message |

**Output:**

Without `--workspace`: Lists available workspaces with GIDs.

With `--workspace`: JSON object containing:
- `metadata`: Fetch timestamp, account used
- `workspace`: Workspace info
- `projects`: Array of projects (name, gid, owner, dates, etc.)

## Asana URL Formats

Tasks can be identified by their URL:

```
https://app.asana.com/0/PROJECT_GID/TASK_GID
https://app.asana.com/0/PROJECT_GID/TASK_GID/f
```

Where:
- `PROJECT_GID` - Project or list ID
- `TASK_GID` - Task ID (this is what's used)
- `/f` - Optional "full pane" view suffix

## Examples

### Read task by URL

```bash
node scripts/read-task.js \
  --url "https://app.asana.com/0/1234567890123/9876543210987"
```

### Read task by ID

```bash
node scripts/read-task.js --id 9876543210987
```

### Read task by ID with specific account

```bash
node scripts/read-task.js --id 9876543210987 --account work
```

### Search for task by name

First, find your workspace GID:

```bash
# This will list available workspaces if you don't specify one
node scripts/read-task.js --name "anything" --account personal
```

Then search:

```bash
node scripts/read-task.js \
  --name "Fix login bug" \
  --workspace 1234567890123 \
  --account work
```

### Pipe output to jq for formatting

```bash
node scripts/read-task.js --id 9876543210987 | jq '.task.notes'
```

### List available workspaces

```bash
node scripts/list-projects.js --account work
```

### List projects in a workspace

```bash
node scripts/list-projects.js --workspace 1197100180628208 --account work
```

### List all projects including archived

```bash
node scripts/list-projects.js --workspace 1197100180628208 --archived
```

## Error Codes

| Code | Description | Remediation |
|------|-------------|-------------|
| `ASANA_SDK_MISSING` | asana package is not installed | Run: `npm install asana` |
| `ASANA_AUTH_MISSING` | ASANA_ACCOUNTS not set | Set the environment variable |
| `ASANA_AUTH_INVALID` | Token is invalid or expired | Generate a new PAT |
| `ASANA_ACCOUNT_AMBIGUOUS` | Multiple accounts, none specified | Use `--account <name>` |
| `ASANA_ACCOUNT_NOT_FOUND` | Account name not in config | Check ASANA_ACCOUNTS |
| `ASANA_URL_INVALID` | Invalid task URL format | Use a valid Asana task URL |
| `ASANA_TASK_NOT_FOUND` | Task not found or no access | Verify task exists and permissions |
| `ASANA_SEARCH_AMBIGUOUS` | Search returned multiple tasks | Refine search or use `--id`/`--url` |
| `ASANA_SEARCH_NO_RESULTS` | No matching tasks found | Try different search terms |
| `ASANA_WORKSPACE_REQUIRED` | Workspace needed for search | Use `--workspace <gid>` |
| `ASANA_RATE_LIMITED` | API rate limit exceeded | Wait and retry (1500 req/min limit) |
| `ASANA_API_ERROR` | General API error | Check error details |

## Library Files

### lib/client.js
Asana API client wrapper with methods for:
- `createClient(asana, token)` - Create authenticated client
- `getTask(client, gid)` - Fetch task details
- `getTaskComments(client, gid)` - Fetch task comments
- `searchTasks(client, workspace, query)` - Search tasks by name
- `getWorkspaces(client)` - List available workspaces

### lib/accounts.js
Multi-account configuration handling:
- `parseAccounts(json)` - Parse ASANA_ACCOUNTS JSON
- `resolveAccount(accounts, name)` - Select account by name

### lib/url-parser.js
Parse Asana URLs to extract project and task GIDs.

### lib/normalizer.js
Format API responses into consistent output structure.

### lib/errors.js
Structured error handling with codes and remediation guidance.

## Official Documentation

- [Asana API Documentation](https://developers.asana.com/docs)
- [Personal Access Tokens](https://developers.asana.com/docs/personal-access-token)
- [Tasks](https://developers.asana.com/docs/tasks)
- [Stories (Comments)](https://developers.asana.com/docs/stories)
- [Workspaces](https://developers.asana.com/docs/workspaces)
- [Search API](https://developers.asana.com/docs/search-tasks-in-a-workspace)
- [Rate Limits](https://developers.asana.com/docs/rate-limits)
