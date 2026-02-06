---
name: slack-reader
description: 'Read Slack messages by permalink URL. Fetches message content, thread replies, channel context, and resolves user mentions. Read-only access to Slack workspace data.'
---

# Slack Reader

Read Slack messages and context by permalink URL. This skill provides read-only access to Slack workspace data.

## Overview

Fetches Slack message content given a message permalink, including:
- The target message with resolved @mentions
- Thread replies (if the message is a thread parent)
- Surrounding channel context (messages before/after)
- Channel metadata (name, topic, purpose)
- Resolved user profiles

## Setup

### Prerequisites
- Node.js 20+
- `@slack/web-api` package: `npm install @slack/web-api`

### Environment Variables

#### Single Workspace (Simple Setup)

```bash
export SLACK_BOT_TOKEN=xoxb-your-bot-token
```

#### Multiple Workspaces

For accessing multiple Slack workspaces, use `SLACK_WORKSPACES` with a JSON object mapping aliases to tokens:

```bash
export SLACK_WORKSPACES='{"personal": "xoxb-personal-token", "company": "xoxb-company-token"}'
```

Workspace aliases are used for:
- The `--workspace` flag to explicitly select a workspace
- Error messages when workspace selection is ambiguous
- Auto-matching against URL domains (e.g., URL domain "company" matches alias "company")

### Required Slack Scopes

Your Slack app must have these OAuth scopes:

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read messages from public channels |
| `channels:read` | View basic channel info |
| `groups:history` | Read messages from private channels |
| `groups:read` | View basic private channel info |
| `im:history` | Read direct messages |
| `im:read` | View basic DM info |
| `mpim:history` | Read group direct messages |
| `mpim:read` | View basic group DM info |
| `users:read` | View user profiles |

### Creating a Slack Token

#### Option 1: Create from Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From a manifest**
3. Select your workspace
4. Choose **JSON** and paste:

```json
{
  "display_information": {
    "name": "Slack Reader",
    "description": "Read-only access for agent skills",
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
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "users:read"
      ],
      "bot": [
        "canvases:read",
        "channels:history",
        "channels:read",
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

5. Click **Create** → **Install to Workspace**
6. Copy the **User OAuth Token** (starts with `xoxp-`)

> **User tokens** (`xoxp-`) can access all channels you have access to.
> **Bot tokens** (`xoxb-`) require the bot to be invited to each channel.

#### Option 2: Manual Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create or select your app
3. Navigate to **OAuth & Permissions**
4. Add the required scopes under **User Token Scopes** (or Bot Token Scopes)
5. Install the app to your workspace
6. Copy the token (`xoxp-` for user, `xoxb-` for bot)

## Available Scripts

### read-message.js

Read a Slack message by permalink URL.

```bash
node scripts/read-message.js --url <permalink> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--url <url>` | Slack message permalink (required) |
| `--workspace <name>` | Workspace alias when using multiple workspaces |
| `--context-size <n>` | Number of messages before/after for context (default: 5) |
| `--help` | Show help message |

**Workspace Resolution:**

When multiple workspaces are configured, the script resolves which token to use:
1. If `--workspace` is specified, uses that workspace's token
2. If the URL domain matches a workspace alias, uses that token
3. If ambiguous, returns a `SLACK_WORKSPACE_AMBIGUOUS` error listing available workspaces

Example with workspace flag:
```bash
node scripts/read-message.js \
  --url "https://myworkspace.slack.com/archives/C0123456789/p1706554800123456" \
  --workspace company
```

**Output:**

JSON object containing:
- `metadata`: URL, fetch timestamp, workspace
- `channel`: Channel info (name, topic, purpose)
- `targetMessage`: The requested message with resolved mentions
- `thread`: Thread replies if the message is a thread parent
- `context`: Messages before and after the target

## Slack URL Format

Message permalinks follow this format:
```
https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP
```

Where:
- `workspace` - Your Slack workspace subdomain
- `CHANNEL_ID` - Channel ID (e.g., `C01234567`)
- `TIMESTAMP` - Message timestamp without decimal (e.g., `p1706554800123456`)

You can get a message permalink by clicking the message menu (⋮) and selecting "Copy link".

## Examples

### Read a message with default context

```bash
node scripts/read-message.js \
  --url "https://myworkspace.slack.com/archives/C0123456789/p1706554800123456"
```

### Read with more surrounding context

```bash
node scripts/read-message.js \
  --url "https://myworkspace.slack.com/archives/C0123456789/p1706554800123456" \
  --context-size 10
```

### Pipe output to jq for formatting

```bash
node scripts/read-message.js --url "https://..." | jq '.targetMessage'
```

## Error Codes

| Code | Description | Remediation |
|------|-------------|-------------|
| `SLACK_SDK_MISSING` | @slack/web-api package is not installed | Run: `npm install @slack/web-api` |
| `SLACK_AUTH_MISSING` | No tokens configured | Set SLACK_BOT_TOKEN or SLACK_WORKSPACES |
| `SLACK_AUTH_INVALID` | Token is invalid or expired | Verify token and app installation |
| `SLACK_WORKSPACES_INVALID` | SLACK_WORKSPACES is not valid JSON | Check JSON format |
| `SLACK_WORKSPACE_NOT_FOUND` | Specified workspace alias not found | Use `--workspace` with valid alias |
| `SLACK_WORKSPACE_AMBIGUOUS` | Multiple workspaces configured but none specified | Use `--workspace` flag to select |
| `SLACK_URL_INVALID` | Invalid message URL format | Use a valid permalink |
| `SLACK_CHANNEL_NOT_FOUND` | Channel not found or bot lacks access | Invite bot to channel |
| `SLACK_MESSAGE_NOT_FOUND` | Message not found | Verify URL and message exists |
| `SLACK_PERMISSION_DENIED` | Missing required scopes | Add required OAuth scopes |
| `SLACK_RATE_LIMITED` | API rate limit exceeded | Wait and retry |
| `SLACK_API_ERROR` | General API error | Check error details |

## Library Files

### lib/client.js
Slack API client wrapper with methods for:
- `createClient(WebClient, token)` - Create authenticated client
- `getMessage(client, channelId, ts)` - Fetch a single message
- `getThreadReplies(client, channelId, threadTs)` - Fetch thread replies
- `getChannelContext(client, channelId, ts, size)` - Fetch surrounding messages
- `getChannelInfo(client, channelId)` - Fetch channel metadata
- `resolveUsers(client, userIds)` - Fetch user profiles

### lib/url-parser.js
Parse Slack permalinks to extract workspace, channel ID, and message timestamp.

### lib/normalizer.js
Format API responses into consistent output structure.

### lib/errors.js
Structured error handling with codes and remediation guidance.

### lib/workspaces.js
Multi-workspace token management:
- `parseWorkspaces(envValue)` - Parse SLACK_WORKSPACES JSON
- `getConfiguredWorkspaces()` - Get all configured workspaces
- `resolveWorkspace(workspaces, specifiedName, urlDomain)` - Resolve which workspace to use
- `getAvailableWorkspaces()` - Get comma-separated list of workspace aliases

## Official Documentation

- [Slack Web API](https://api.slack.com/methods)
- [conversations.history](https://api.slack.com/methods/conversations.history)
- [conversations.replies](https://api.slack.com/methods/conversations.replies)
- [conversations.info](https://api.slack.com/methods/conversations.info)
- [users.info](https://api.slack.com/methods/users.info)
- [Bot Tokens](https://api.slack.com/authentication/token-types#bot)
- [OAuth Scopes](https://api.slack.com/scopes)
