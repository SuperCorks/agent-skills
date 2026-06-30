---
name: pastel-reader
description: Query Pastel (usepastel.com) canvas URLs and comments/annotations with read-only Node helpers and multi-account token aliases. Use when Codex needs to manage Pastel auth, store Pastel API tokens in zshrc, list account aliases, pull/export/summarize/audit/troubleshoot Pastel canvas feedback from a Pastel URL, including direct /comment/{id} links, comments, replies, labels, attachments, screenshots, status, assignees, and metadata.
---

# Pastel Reader

Read Pastel canvases and canvas comments. Pastel's product UI and Zapier integration call comments `annotations`, so this skill uses both terms.

## API Notes

- Base URL: `https://api.usepastel.com/v1`
- Auth: `Authorization: Bearer <token>` selected from `PASTEL_ACCOUNTS`, `PASTEL_ACCOUNT`, or the legacy `PASTEL_API_TOKEN` fallback.
- Public docs are limited. These endpoints were verified from Pastel's frontend bundle, public Zapier metadata, and response probes:
  - `GET /users/me`
  - `GET /users/me/canvases?filters=<json>&offset=<n>&limit=<n>`
  - `GET /canvases/{canvasId}`
  - `GET /canvases/{canvasId}/annotations`
  - `GET /canvases/{slug}/subdomain` resolves public share URLs such as `https://usepastel.com/link/328ppzw3` to a numeric canvas id.
  - `GET /users/me/token` and `POST /users/me/token` exist in the web app for viewing/rotating the API token, but they require a logged-in web session cookie.
- Zapier exposes Pastel app `PastelCLIAPI@1.0.3` with trigger `Get Comment`, key `annotation`, requiring a `canvas` field. The trigger fires when a new comment is created on a canvas.

## Setup

Preferred multi-account setup:

```bash
node scripts/auth.js set --account yogaworks --token YOUR_PASTEL_API_TOKEN --default
node scripts/auth.js list
```

This writes a managed block to `~/.zshrc`:

```bash
export PASTEL_ACCOUNTS='{"yogaworks":"YOUR_PASTEL_API_TOKEN"}'
export PASTEL_ACCOUNT='yogaworks'
```

Use `--account <alias>` on read commands when multiple accounts are configured. If `PASTEL_ACCOUNTS` is not loaded in the shell, the scripts fall back to reading the managed `~/.zshrc` block directly.

One-off fallback:

```bash
export PASTEL_API_TOKEN='YOUR_PASTEL_API_TOKEN'
```

Optional:

```bash
export PASTEL_API_BASE_URL='https://api.usepastel.com/v1'
```

Pastel appears to gate API-token access by plan/team state. If a token returns `Invalid API token provided`, ask the user for a fresh token from their Pastel account rather than trying the browser session cookie path.

## Common Workflow

1. Configure or inspect account aliases:

```bash
node scripts/auth.js set --account yogaworks --token YOUR_PASTEL_API_TOKEN --default
node scripts/auth.js replace --account yogaworks --token NEW_PASTEL_API_TOKEN
node scripts/auth.js use --account yogaworks
node scripts/auth.js remove --account old-client
node scripts/list-accounts.js
```

2. Verify the selected account:

```bash
node scripts/verify-access.js --account yogaworks
```

3. Pull comments from the Pastel URL the user provides. URLs ending in `/comment/{id}` return only that comment:

```bash
node scripts/read-comments.js --account yogaworks --canvas-url https://usepastel.com/link/328ppzw3
node scripts/read-comments.js --account yogaworks https://usepastel.com/link/328ppzw3/comment/11933692/ --format markdown
```

4. If the user does not have a URL, find the canvas:

```bash
node scripts/list-canvases.js --account yogaworks --limit 50
node scripts/list-canvases.js --account yogaworks --all --filters-json '{"archived":false}'
```

5. Pull comments by id or name:

```bash
node scripts/read-comments.js --account yogaworks --canvas-id CANVAS_ID
node scripts/read-comments.js --account yogaworks --canvas-name "Homepage review" --format markdown
node scripts/read-comments.js --account yogaworks --canvas-id CANVAS_ID --status active,in-progress --since 2026-06-01
```

6. Use the generic reader when Pastel exposes a resource that does not have a dedicated script:

```bash
node scripts/get-resource.js --account yogaworks --path /canvases/PASTEL_SLUG/subdomain
node scripts/get-resource.js --account yogaworks --path /canvases/CANVAS_ID
node scripts/get-resource.js --account yogaworks --path /users/me/canvases --query-json '{"limit":5}'
```

## Included Scripts

### auth.js

Manages Pastel account aliases in a marked `~/.zshrc` block. Tokens are redacted in output.

```bash
node scripts/auth.js list
node scripts/auth.js set --account ALIAS --token TOKEN --default
node scripts/auth.js replace --account ALIAS --token TOKEN
node scripts/auth.js use --account ALIAS
node scripts/auth.js remove --account ALIAS
```

Options:

| Option | Description |
|--------|-------------|
| `--account <alias>` | Account alias to add, replace, select, or remove |
| `--token <token>` | Pastel API token for `set` or `replace` |
| `--default` | Make the alias the default `PASTEL_ACCOUNT` |
| `--zshrc <path>` | Override the zsh config path; useful for testing |
| `--help` | Show help |

### list-accounts.js

Lists configured aliases from `PASTEL_ACCOUNTS`, the managed `~/.zshrc` block, or the single-token fallback.

```bash
node scripts/list-accounts.js
```

### verify-access.js

Checks `GET /users/me` and a tiny canvas listing request. Use this before a larger pull.

```bash
node scripts/verify-access.js --account ALIAS
```

### list-canvases.js

Lists canvases visible to the token.

```bash
node scripts/list-canvases.js [options]
```

Options:

| Option | Description |
|--------|-------------|
| `--account <alias>` | Account alias from `PASTEL_ACCOUNTS` |
| `--limit <n>` | Page size, default `100` |
| `--offset <n>` | Starting offset, default `0` |
| `--all` | Fetch pages until a short page is returned |
| `--filters-json <json>` | JSON object sent as Pastel's `filters` query param |
| `--raw` | Return raw Pastel canvas objects |
| `--base-url <url>` | Override API base URL |
| `--help` | Show help |

### read-comments.js

Pulls comments/annotations for one canvas. Prefer `--canvas-url` when the user provides a Pastel URL; it resolves `https://usepastel.com/link/{slug}` through `/canvases/{slug}/subdomain` and then reads `/canvases/{canvasId}/annotations`. If the URL contains `/comment/{id}`, the script filters to that annotation id. Use `--canvas-id` or `--canvas-name` only when no URL is available.

```bash
node scripts/read-comments.js --canvas-url PASTEL_URL [options]
node scripts/read-comments.js PASTEL_URL [options]
node scripts/read-comments.js --canvas-id CANVAS_ID [options]
```

Options:

| Option | Description |
|--------|-------------|
| `--account <alias>` | Account alias from `PASTEL_ACCOUNTS` |
| `--canvas-url <url>` | Pastel canvas/comment URL such as `https://usepastel.com/link/328ppzw3` |
| `--url <url>` | Alias for `--canvas-url` |
| `--canvas-id <id>` | Pastel canvas id |
| `--canvas-name <name>` | Unique canvas name match if id is not known |
| `--comment-id <id>` | Return one annotation by id; implied by `/comment/{id}` URLs |
| `--format <json\|markdown\|csv>` | Output format, default `json` |
| `--status <list>` | Comma-separated statuses to keep, e.g. `active,resolved` |
| `--since <date>` | Keep comments created/updated on or after this date |
| `--until <date>` | Keep comments created/updated on or before this date |
| `--search <text>` | Keep comments/replies containing text |
| `--include-canvas` | Include the canvas object in JSON output |
| `--raw` | Return raw annotation objects in JSON |
| `--base-url <url>` | Override API base URL |
| `--help` | Show help |

Known comment fields include `id`, `number`, `CanvasId`, `UserId`, `userName`, `comment`, `status`, `isPrivate`, `assignedUserId`, `fullCommentUrl`, `screenshotUrl`, `afterScreenshotUrl`, `targetSelector`, `targetOffsetX`, `targetOffsetY`, `metadata`, `Labels`, `FileAttachments`, `AnnotationReplies`, and `AnnotationReactions`. Preserve raw output when investigating new fields.

### get-resource.js

Performs a read-only `GET` against any Pastel path.

```bash
node scripts/get-resource.js --account ALIAS --path /users/me
node scripts/get-resource.js --account ALIAS --path /canvases/CANVAS_ID/annotations
node scripts/get-resource.js --account ALIAS --path /users/me/canvases --query-json '{"limit":10}'
```

## Error Handling

Scripts emit JSON errors to stderr with a stable `code` and remediation:

| Code | Meaning |
|------|---------|
| `PASTEL_AUTH_MISSING` | No `PASTEL_ACCOUNTS`, managed zshrc token, or `PASTEL_API_TOKEN` is available |
| `PASTEL_AUTH_INVALID` | Token is invalid, expired, or lacks access |
| `PASTEL_ACCOUNT_AMBIGUOUS` | Multiple accounts are configured but none was selected |
| `PASTEL_ACCOUNT_NOT_FOUND` | `--account` or `PASTEL_ACCOUNT` does not match a configured alias |
| `PASTEL_ACCOUNT_INVALID` | Account alias contains unsupported characters |
| `PASTEL_URL_INVALID` | Pastel URL could not be parsed into a canvas slug/id |
| `PASTEL_NOT_FOUND` | Resource or canvas was not found |
| `PASTEL_RATE_LIMITED` | API rate limit hit |
| `PASTEL_CANVAS_AMBIGUOUS` | `--canvas-name` matched multiple canvases |
| `PASTEL_COMMENT_NOT_FOUND` | URL/`--comment-id` did not match any annotation on the canvas |
| `PASTEL_API_ERROR` | Unclassified API response |

## Safety

The included scripts only issue `GET` requests. Do not use write endpoints such as `POST /users/me/token`, `POST /annotations`, `PUT /annotations/{id}`, or `DELETE /annotations/{id}` unless the user explicitly asks for a mutation and understands the effect.
