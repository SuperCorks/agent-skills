---
name: agent-thread-reader
description: Read local coding-agent thread/session history for Codex, Codex CLI, Copilot CLI, Copilot Chat local VS Code threads, and Claude Code. Use when asked to find, inventory, summarize, search, or inspect local agent conversations, session subjects, transcript files, or agent thread storage.
---

# Agent Thread Reader

Read local coding-agent thread stores on the current machine. This skill is read-only by default and should not delete, rewrite, archive, or compact agent sessions.

## Supported Stores

- Codex Desktop: `~/.codex/session_index.jsonl`, `~/.codex/sessions/**/*.jsonl`, `~/.codex/archived_sessions/*.jsonl`
- Codex CLI: same Codex JSONL stores, separated by `session_meta.payload.originator` values such as `codex_cli_rs` and `codex_exec`
- Copilot CLI: `~/.copilot/session-state/*/events.jsonl`
- Copilot Chat local threads: VS Code `state.vscdb` stores under:
  - `~/Library/Application Support/Code/User/workspaceStorage/*/state.vscdb`
  - `~/Library/Application Support/Code - Insiders/User/workspaceStorage/*/state.vscdb`
  - `~/Library/Application Support/Agents - Insiders/User/workspaceStorage/*/state.vscdb`
- Claude Code: `~/.claude/projects/**/*.jsonl`
- Claude Code desktop metadata: `~/Library/Application Support/Claude/claude-code-sessions/**/*.json`

## Workflow

Use the bundled script first:

```bash
bash scripts/agent-threads.sh subjects --limit 5
```

Common commands:

```bash
# JSONL inventory of known local thread records.
bash scripts/agent-threads.sh inventory

# Recent subjects grouped by agent source.
bash scripts/agent-threads.sh subjects --limit 8

# Recent subjects for one source.
bash scripts/agent-threads.sh subjects --source copilot-chat --limit 10

# Show a normalized transcript from a JSON/JSONL path returned by inventory.
bash scripts/agent-threads.sh show --path "$PATH_FROM_INVENTORY"

# Show VS Code Copilot interactive-session data from a workspace state DB.
bash scripts/agent-threads.sh show --db "$STATE_VSCDB" --key memento/interactive-session
```

Source filters for `subjects`:

- `codex`
- `codex-cli`
- `copilot-cli`
- `copilot-chat`
- `claude-code`
- `all`

## Response Guidelines

- For “what are the latest subjects?” report titles/snippets only, grouped by source.
- For “where is this stored?” include exact local paths and, for VS Code, the SQLite key when relevant.
- For transcript inspection, summarize the relevant turns unless the user asks for raw output.
- Treat transcripts as sensitive local data. Do not print long private messages, tokens, env vars, or credentials unless the user explicitly asks and the content is necessary.
- If a source has no title, derive a subject from the first non-boilerplate user message.

## Manual Fallback

If the helper script cannot run, inspect stores directly:

```bash
jq -r '.thread_name // .title // empty' ~/.codex/session_index.jsonl
find ~/.claude/projects -name '*.jsonl'
find ~/.copilot/session-state -name events.jsonl
sqlite3 "$STATE_VSCDB" "select key, length(value) from ItemTable where lower(key) like '%chat%' or lower(key) like '%copilot%';"
```
