---
name: iterable
description: 'Read Iterable profiles, profile fields, list users, and user events with multi-account API key support. Read-only access for agent Q&A workflows.'
---

# Iterable Reader

Read Iterable data for profiles and events using the Iterable REST API.

## Overview

This skill provides read-only access to:
- User profiles by email or userId
- Project-level user profile fields
- User events by email or userId
- List members by list ID

## Setup

### Prerequisites
- Node.js 20+

### Environment Variables

Use a multi-account JSON map:

```bash
export ITERABLE_ACCOUNTS='{"prod":"YOUR_PROD_API_KEY","sandbox":"YOUR_SANDBOX_API_KEY"}'
```

YogaWorks account example:

```bash
export ITERABLE_ACCOUNTS='{"yogaworks":"YOUR_API_KEY"}'
```

When multiple accounts are configured, pass `--account <name>`.

If only one account is configured, it is used automatically.

## Available Scripts

### read-user.js

Read a user profile by email or userId.

```bash
node scripts/read-user.js [--email EMAIL | --user-id USER_ID] [options]
```

### list-user-fields.js

List all user profile fields configured in the Iterable project.

```bash
node scripts/list-user-fields.js [options]
```

### read-user-events.js

Read events for a single user.

```bash
node scripts/read-user-events.js [--email EMAIL | --user-id USER_ID] [options]
```

### list-users-in-list.js

List users in an Iterable list.

```bash
node scripts/list-users-in-list.js --list-id LIST_ID [options]
```

## Options

Common options:

| Option | Description |
|--------|-------------|
| `--account <name>` | Account name from `ITERABLE_ACCOUNTS` |
| `--base-url <url>` | Override API base URL (defaults to `https://api.iterable.com/api`) |
| `--help` | Show help |

Command-specific options:

| Command | Option | Description |
|---------|--------|-------------|
| `read-user-events.js` | `--limit <n>` | Number of events to fetch (1-200, default 30) |
| `list-users-in-list.js` | `--prefer-user-id` | Return userId where available in hybrid projects |

## Output Format

All scripts output JSON:

- `metadata`
  - `fetchedAt`
  - `account`
  - `endpoint`
- payload object depending on command (`user`, `fields`, `events`, `users`)

## Identifier Mode Notes

Iterable projects can be email-based, userId-based, or hybrid.

- In email-based projects, `--email` lookups are generally the reliable default.
- `--user-id` endpoints may return empty/not found depending on project identity settings.
- For YogaWorks current behavior, prefer `--email` for profile and event investigation.

## Smoke Test

Run a quick live check:

```bash
node scripts/read-user.js --email matthew@redkrypton.com --account yogaworks
node scripts/list-user-fields.js --account yogaworks
node scripts/read-user-events.js --email matthew@redkrypton.com --limit 20 --account yogaworks
```

## Examples

```bash
# Read a profile by email
node scripts/read-user.js --email user@example.com --account prod

# Read events by userId
node scripts/read-user-events.js --user-id 12345 --limit 100 --account prod

# List project user fields
node scripts/list-user-fields.js --account sandbox

# List users in list 9876
node scripts/list-users-in-list.js --list-id 9876 --account prod
```

## Error Codes

| Code | Description | Remediation |
|------|-------------|-------------|
| `ITERABLE_AUTH_MISSING` | `ITERABLE_ACCOUNTS` not set | Set env var with account API keys |
| `ITERABLE_AUTH_INVALID` | API key invalid/expired | Verify API key and project permissions |
| `ITERABLE_ACCOUNT_AMBIGUOUS` | Multiple accounts, none specified | Use `--account <name>` |
| `ITERABLE_ACCOUNT_NOT_FOUND` | Account name not configured | Check `ITERABLE_ACCOUNTS` |
| `ITERABLE_ARGS_INVALID` | Required flags missing/invalid | Check `--help` for command syntax |
| `ITERABLE_NOT_FOUND` | User/list not found | Verify identifiers and account |
| `ITERABLE_RATE_LIMITED` | API rate limit exceeded | Retry after backoff |
| `ITERABLE_API_ERROR` | General API error | Check error details and request params |
