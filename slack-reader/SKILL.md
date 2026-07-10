---
name: slack-reader
description: 'Read and search Slack message history, list accessible conversations, inspect message permalinks and threads, resolve user mentions, and download images or files uploaded to messages. Use for Slack permalink investigation, conversation history, workspace search, or attachment retrieval with multi-workspace read-only access.'
---

# Slack Reader

Use the bundled Node.js scripts for read-only Slack access. Prefer a user OAuth token (`xoxp-`) because it can see the same conversations as the user and is required for search.

## Choose a workflow

- Read a permalink, its complete thread, and surrounding context: `scripts/read-message.js`
- Discover channel, DM, and group-DM IDs: `scripts/list-conversations.js`
- Read recent or date-bounded messages from one conversation: `scripts/conversation-history.js`
- Search messages across a workspace: `scripts/search-messages.js`
- Download uploaded images and files from a message or thread: `scripts/download-files.js`

All commands write structured JSON to stdout and errors to stderr. Keep tokens out of commands and output; configure them only through environment variables.

## Setup

Requirements:

- Node.js 20+
- Dependencies installed with `npm install` in this skill directory

Configure one workspace:

```bash
export SLACK_BOT_TOKEN='xoxp-your-user-token'
```

Configure multiple workspaces:

```bash
export SLACK_WORKSPACES='{"personal":"xoxp-personal-token","company":"xoxp-company-token"}'
```

Workspace selection order is `--workspace`, permalink hostname matching, then the only configured workspace. Commands without a permalink require `--workspace` when more than one workspace is configured.

## OAuth scopes

| Scope | Purpose |
|---|---|
| `channels:read`, `groups:read`, `im:read`, `mpim:read` | List and identify conversations |
| `channels:history`, `groups:history`, `im:history`, `mpim:history` | Read message history and threads |
| `users:read` | Resolve users and mentions |
| `search:read` | Search messages; user token only |
| `files:read` | Fetch file metadata and download private file URLs |
| `canvases:read` | Read Slack canvas metadata already supported by the app |

After adding scopes, reinstall the app to each workspace and replace the saved token. Previously issued tokens do not gain newly added scopes automatically.

Create or update the app from this manifest:

```json
{
  "display_information": {
    "name": "Slack Reader",
    "description": "Read-only Slack access for agent skills",
    "background_color": "#0040ff"
  },
  "features": {
    "bot_user": {
      "display_name": "Slack Reader",
      "always_online": false
    }
  },
  "oauth_config": {
    "scopes": {
      "user": [
        "canvases:read",
        "channels:history",
        "channels:read",
        "files:read",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "search:read",
        "users:read"
      ],
      "bot": [
        "canvases:read",
        "channels:history",
        "channels:read",
        "files:read",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "users:read"
      ]
    }
  },
  "settings": {
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

## Read a permalink

```bash
node scripts/read-message.js --url 'https://workspace.slack.com/archives/C123/p1706554800123456'
```

Options:

| Option | Meaning |
|---|---|
| `--url <url>` | Message permalink; required |
| `--workspace <name>` | Explicit workspace alias |
| `--context-size <n>` | Messages before and after; default `5`, maximum `100`, use `0` for none |

The script matches the exact message timestamp. When a permalink points to a thread reply using `thread_ts`, it reads that reply and returns the complete thread rather than substituting a nearby channel message.

## List conversations

```bash
node scripts/list-conversations.js --workspace company --types im,mpim --limit 100
```

Options:

| Option | Meaning |
|---|---|
| `--workspace <name>` | Workspace alias |
| `--types <types>` | Any of `public_channel,private_channel,mpim,im`; default all |
| `--limit <n>` | Maximum results; default `100`, maximum `1000` |
| `--cursor <cursor>` | Resume from a returned cursor |
| `--include-archived` | Include archived conversations |

DM entries include the resolved user's display name. Use the returned conversation ID with `conversation-history.js`.

## Read conversation history

```bash
node scripts/conversation-history.js --channel D0123456789 --workspace company --limit 100
node scripts/conversation-history.js --url 'https://workspace.slack.com/archives/C123/p1706554800123456' --oldest '2026-07-01T00:00:00Z' --order asc
```

Provide either `--channel` or `--url`. `--oldest` and `--latest` accept Slack timestamps or ISO 8601 dates. Use `--inclusive` to include exact bounds and `--order asc` for chronological output; the default is newest first.

## Search messages

```bash
node scripts/search-messages.js --workspace company --query 'launch plan after:2026-06-01' --count 50 --sort timestamp
```

Search requires an `xoxp-` user token with `search:read`. Slack search modifiers such as `in:channel`, `from:<@USERID>`, `before:`, and `after:` can be included in `--query`.

Options:

| Option | Meaning |
|---|---|
| `--query <query>` | Slack search query; required |
| `--count <n>` | Results per page; default `20`, maximum `100` |
| `--page <n>` | Page number; default `1`, maximum `100` |
| `--sort <mode>` | `score` or `timestamp` |
| `--sort-dir <dir>` | `desc` or `asc` |

## Download uploaded files

```bash
node scripts/download-files.js \
  --url 'https://workspace.slack.com/archives/D0123456789/p1706554800123456' \
  --output-dir './downloads'
```

Add `--include-thread` to download files from the parent and every reply. The command:

- Downloads entries in Slack's message `files` collection, including uploaded images and documents
- Uses `url_private_download` with bearer authentication and requires `files:read`
- Preserves existing files by suffixing duplicate names (`image-2.png`)
- Sanitizes filenames and writes through a temporary file
- Verifies the downloaded byte count and rejects HTML login/access pages
- Returns each absolute output path and the message timestamp that contained the file

It does not download third-party images shown only as link unfurls in message `attachments`; those are remote previews rather than Slack-uploaded files.

## Errors

Common error codes:

| Code | Action |
|---|---|
| `SLACK_AUTH_MISSING` | Configure `SLACK_WORKSPACES` or `SLACK_BOT_TOKEN` |
| `SLACK_WORKSPACE_AMBIGUOUS` | Add `--workspace` |
| `SLACK_MESSAGE_NOT_FOUND` | Verify the exact permalink and token access |
| `SLACK_PERMISSION_DENIED` | Add the needed scope, reinstall the app, and update the token |
| `SLACK_USER_TOKEN_REQUIRED` | Use an `xoxp-` token for search |
| `SLACK_FILE_DOWNLOAD_FAILED` | Verify `files:read`, file access, and the destination |
| `SLACK_RATE_LIMITED` | Wait and retry |

## References

- [Slack conversations.list](https://docs.slack.dev/reference/methods/conversations.list/)
- [Slack conversations.history](https://docs.slack.dev/reference/methods/conversations.history/)
- [Slack search.messages](https://docs.slack.dev/reference/methods/search.messages/)
- [Slack file object and authenticated downloads](https://docs.slack.dev/reference/objects/file-object/)
