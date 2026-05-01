---
name: google-workspace
description: 'Operate Google Workspace (Drive, Gmail, Calendar, Sheets, Docs, Slides, Chat, Admin, Forms, Tasks…) via the @googleworkspace/cli (`gws`) Rust CLI distributed on npm. Use for any read/write task across Workspace APIs — list/search/upload Drive files (incl. shared drives), send/read mail, manage calendar events, sheets cell ops, etc.'
---

# Google Workspace CLI (gws)

Drive a single CLI — `@googleworkspace/cli`, command name `gws` — to call any Google Workspace API. Built dynamically from Google's Discovery Service, so every API method is exposed as `gws <service> <resource> [sub-resource] <method> [flags]`. Output is JSON by default (also yaml/csv/table). Run via `npx --yes @googleworkspace/cli ...` — no install required.

This is **not** an officially supported Google product; it's a community CLI. Repo: https://github.com/googleworkspace/cli

## When to use

Pick this skill when a task touches Google Workspace user data: Drive files / shared drives, Gmail messages, Calendar events, Sheets cells, Docs content, Slides, Chat, Forms, Tasks, Admin SDK, etc. Pick another tool only when:

- The user has a service-account-based Workspace MCP server already wired up — use it instead.
- The task is GCP/cloud-platform only (BigQuery, GCS, Pub/Sub, etc.) — use `gcloud` / `bq` / `gsutil` directly.
- Read-only public Drive content the user can share via a link — `WebFetch` may be enough.

## Setup

### 1. OAuth client (one-time, per machine)

Workspace data scopes (Drive, Gmail, …) are blocked for the gcloud default OAuth client. You **must** supply your own OAuth client. Two paths:

- **Desktop OAuth client** — needed for the `gws auth login` browser flow and for `gcloud auth application-default login --client-id-file=...`. Create one in your GCP project: Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Desktop app**. Save the JSON to `~/.config/gws/client_secret.json`.
- **Service account with domain-wide delegation** — the right choice for automation in a Workspace org you control. Avoids browser flows entirely and lets you impersonate users.

Hot tip: in a Workspace org, set the OAuth consent screen's User Type to **Internal** to skip Google verification entirely for users in that org.

The OAuth client's GCP project also needs the relevant APIs enabled (Drive, Gmail, etc.). `gws auth setup --dry-run` lists them; `gws auth setup` enables all 22 if you have permission.

### 2. Credentials

`gws` looks for credentials in this order (highest priority first):

| Source | Env var / location | Notes |
|---|---|---|
| Pre-obtained access token | `GOOGLE_WORKSPACE_CLI_TOKEN` | Best for one-off scripts. Tokens expire in ~1h. |
| OAuth credentials JSON | `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` | Path to a stored OAuth credentials file (refresh token included). |
| Encrypted/keyring creds | `~/.config/gws/credentials.enc` | Set up by `gws auth login`. |
| Plain creds | `~/.config/gws/credentials.json` | Fallback storage. |

`GOOGLE_WORKSPACE_CLI_CLIENT_ID` + `GOOGLE_WORKSPACE_CLI_CLIENT_SECRET` env vars can replace `~/.config/gws/client_secret.json`.

### 3. Authenticating

#### Path A — gws OAuth login (best for repeated use, refresh token is cached)

```bash
mkdir -p ~/.config/gws
cp /path/to/client_secret_DESKTOP.json ~/.config/gws/client_secret.json
npx --yes @googleworkspace/cli auth login --services drive   # narrow to needed services
# Browser opens. After consent, refresh token is cached.
npx --yes @googleworkspace/cli auth status
```

`--services` accepts comma-separated names (e.g. `drive,gmail,sheets`). Without it, the consent screen shows the full scope list. Use `--readonly` for read-only scopes.

#### Path B — Reuse gcloud ADC (no second browser flow)

If the user already has gcloud, get a Drive-scoped ADC and pass the access token to `gws`:

```bash
# Use a Desktop OAuth client (Internal/External app type works) — gcloud's default client cannot get Drive scope
gcloud auth application-default login \
  --client-id-file=/path/to/client_secret_DESKTOP.json \
  --scopes=openid,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/userinfo.email
# Then for every gws command:
export GOOGLE_WORKSPACE_CLI_TOKEN="$(gcloud auth application-default print-access-token)"
```

Notes:

- `cloud-platform` scope is required by `application-default login` — include it.
- Don't pass `--no-launch-browser` together with `--client-id-file` (gcloud rejects it; use `--no-browser` only for cross-machine flows).
- Tokens expire ~1h. For longer sessions re-run `print-access-token` and re-export.

#### Path C — Service account (automation, no browser)

```bash
# Service account with DWD authorized in Workspace Admin → Security → API controls
gcloud auth activate-service-account --key-file=/path/to/sa.json
# `gws` does not natively impersonate users; for Drive shared drives where the user is a member, use Path B with that user's ADC.
```

For full DWD-based impersonation, use `googleapis` Node SDK directly (this skill doesn't ship a wrapper).

## Command shape

```
gws <service> <resource> [sub-resource] <method> [--params JSON] [--json BODY] [--upload PATH] [flags]
```

- `--params <JSON>` — query-string params for the request (`q`, `pageSize`, `fields`, `corpora`, `supportsAllDrives`, etc.). **Most flexibility lives here**, not in named flags.
- `--json <JSON>` — request body for create/update.
- `--upload <PATH>` — multipart media upload. **Path must be inside the current working directory** (gws sandboxes paths). `cd` to the file's directory first.
- `--upload-content-type <MIME>` — explicit MIME if not inferable.
- `--format <json|table|yaml|csv>` — output format.
- `--page-all` — auto-paginate, emits NDJSON (one page per line).
- `--dry-run` — validate locally, don't call API.

Discover any method's schema:

```bash
npx --yes @googleworkspace/cli schema drive.files.list --resolve-refs
npx --yes @googleworkspace/cli drive files list --help
```

## Drive recipes

### List shared drives

```bash
gws drive drives list | jq '.drives[] | {id, name}'
```

### Search across all drives (incl. shared drives)

```bash
gws drive files list --params '{
  "q": "name contains '"'"'WEAR-HF'"'"' and mimeType='"'"'application/vnd.google-apps.folder'"'"'",
  "corpora": "allDrives",
  "includeItemsFromAllDrives": true,
  "supportsAllDrives": true,
  "fields": "files(id,name,mimeType,parents,driveId)",
  "pageSize": 100
}'
```

Key points:

- The `q` parameter goes inside `--params` JSON, **not** as a `--q` flag.
- For shared drives you must set `corpora=allDrives`, `includeItemsFromAllDrives=true`, `supportsAllDrives=true`.
- Use `mimeType='application/vnd.google-apps.folder'` to filter folders.

### Walk a folder

```bash
gws drive files list --params '{
  "q": "'"'"'<FOLDER_ID>'"'"' in parents",
  "corpora": "drive",
  "driveId": "<DRIVE_ID>",
  "includeItemsFromAllDrives": true,
  "supportsAllDrives": true,
  "fields": "files(id,name,mimeType)",
  "pageSize": 200
}'
```

### Upload a file to a shared-drive folder

```bash
# gws sandboxes uploads to cwd — cd to the file's directory first
cd /Users/me/Downloads
export GOOGLE_WORKSPACE_CLI_TOKEN="$(gcloud auth application-default print-access-token)"
gws drive files create \
  --params '{"supportsAllDrives":true,"fields":"id,name,parents,driveId,webViewLink,size"}' \
  --json '{"name":"poster.pdf","parents":["<FOLDER_ID>"],"mimeType":"application/pdf"}' \
  --upload "poster.pdf" \
  --upload-content-type application/pdf
```

Returns `{id, name, parents, driveId, webViewLink, size}`.

### Download a file

```bash
gws drive files get --params '{"fileId":"<FILE_ID>","alt":"media","supportsAllDrives":true}' \
  --output ./out.pdf
```

### Move / rename a file

```bash
# Rename
gws drive files update --params '{"fileId":"<ID>","supportsAllDrives":true}' --json '{"name":"new-name.pdf"}'
# Move (replace parent)
gws drive files update --params '{"fileId":"<ID>","addParents":"<NEW_PARENT>","removeParents":"<OLD_PARENT>","supportsAllDrives":true}' --json '{}'
```

## Gmail recipes

### List recent messages

```bash
gws gmail users messages list --params '{"userId":"me","q":"in:inbox newer_than:7d","maxResults":20}'
```

### Get a message body

```bash
gws gmail users messages get --params '{"userId":"me","id":"<MESSAGE_ID>","format":"full"}'
```

### Send a message

```bash
# Build a base64url-encoded RFC 822 message
RAW=$(printf 'To: a@b.com\r\nSubject: hi\r\n\r\nbody' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
gws gmail users messages send --params '{"userId":"me"}' --json "{\"raw\":\"$RAW\"}"
```

⚠️ Sending mail on behalf of the user requires explicit user permission per request.

## Calendar recipes

### List upcoming events

```bash
gws calendar events list --params "{
  \"calendarId\":\"primary\",
  \"timeMin\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"singleEvents\":true,
  \"orderBy\":\"startTime\",
  \"maxResults\":20
}"
```

### Create an event

```bash
gws calendar events insert --params '{"calendarId":"primary"}' --json '{
  "summary":"Sync",
  "start":{"dateTime":"2026-05-02T10:00:00-04:00"},
  "end":{"dateTime":"2026-05-02T10:30:00-04:00"}
}'
```

## Sheets recipes

```bash
# Read a range
gws sheets spreadsheets values get --params '{"spreadsheetId":"<SHEET_ID>","range":"Sheet1!A1:D"}'

# Write/append
gws sheets spreadsheets values append \
  --params '{"spreadsheetId":"<SHEET_ID>","range":"Sheet1!A:D","valueInputOption":"USER_ENTERED"}' \
  --json '{"values":[["Alice",30,"a@x.com","2026-05-01"]]}'
```

## Gotchas

- **Quoting `q`**: when the value contains single quotes (Drive's literal-string syntax), build the JSON via a heredoc / file rather than fighting shell escaping:

  ```bash
  cat > /tmp/p.json <<'JSON'
  {"q":"name contains 'foo'","corpora":"allDrives","includeItemsFromAllDrives":true,"supportsAllDrives":true,"fields":"files(id,name)"}
  JSON
  gws drive files list --params "$(cat /tmp/p.json)"
  ```

- **`--upload` path sandbox**: paths outside cwd are rejected with `outside the current directory`. Fix: `cd` to the parent dir, pass a relative or basename path.
- **Argument naming**: prefer `--params '{…}'` for query/path params; named flags like `--pageSize`, `--q`, `--corpora` are not exposed.
- **Shared drives**: always set `supportsAllDrives:true` (and `includeItemsFromAllDrives:true` on list-style methods). Without these you'll silently see only My Drive items.
- **Token expiry**: `GOOGLE_WORKSPACE_CLI_TOKEN` is a 1-hour access token. Re-export from `gcloud auth application-default print-access-token` when calls start failing with 401.
- **Default OAuth client cannot access Workspace data**: the gcloud built-in client is restricted to `cloud-platform`. Always pass `--client-id-file=` to `application-default login` for Drive/Gmail/etc. scopes, or use `gws auth login` with your own client.
- **Output is JSON**: pipe through `jq` for transformation. `--page-all` emits NDJSON (one page object per line) — use `jq -s '[.[].files[]]'` to flatten.

## Discovering capabilities

```bash
npx --yes @googleworkspace/cli --help                # top-level services
npx --yes @googleworkspace/cli drive --help          # Drive resources
npx --yes @googleworkspace/cli drive files --help    # files methods
npx --yes @googleworkspace/cli drive files list --help
npx --yes @googleworkspace/cli schema drive.files.list --resolve-refs
```

The CLI also bundles "skills" / workflows (cross-service shortcuts) under `gws workflow ...` (alias `wf`).

## Permissioning checklist

Before running any write op (upload, send, modify, delete), confirm with the user:

1. Which **account** is authenticated (`gws auth status` → `account` field).
2. Which **destination** (drive ID + folder path, or recipient email).
3. The **action** — uploads, sends, deletes are not reversible without effort.
