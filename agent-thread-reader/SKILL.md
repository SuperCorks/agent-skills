---
name: agent-thread-reader
description: Read local coding-agent thread/session history for T3 Code, Codex, Copilot, and Claude Code. Use for T3 Cork thread deep links (t3cork://), or requests to find, inventory, summarize, search, or inspect local agent conversations and their storage.
---

# Agent Thread Reader

Read local coding-agent thread stores on the current machine. This skill is read-only by default and should not delete, rewrite, archive, or compact agent sessions.

## Supported Stores

- T3 Code / T3 Cork: `~/.t3/userdata/state.sqlite`, `~/.t3-fork/userdata/state.sqlite`, and `T3CODE_HOME` stores. Also discovers `dev/state.sqlite` and ancestor worktree `.t3` directories. Each store's sibling `environment-id` identifies the environment in a deep link.
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

For a `t3cork://app/<environmentId>/<threadId>` link, go straight to `resolve` or `show --link`; do not start with a full inventory or search native Codex/Claude stores by the link's thread ID. See [T3 deep links](#t3-deep-links) for custom stores and native session mapping.

Run the bundled script by its path inside this skill directory. For broad subject requests:

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

# Resolve a T3 thread to its database, title, message counts, and native session ID.
bash scripts/agent-threads.sh resolve --link 't3cork://app/ENVIRONMENT_ID/THREAD_ID'

# Read a T3 conversation; optionally limit to the latest visible messages.
bash scripts/agent-threads.sh show --link 't3cork://app/ENVIRONMENT_ID/THREAD_ID' --limit 20

# Show a normalized transcript from a JSON/JSONL path returned by inventory.
bash scripts/agent-threads.sh show --path "$PATH_FROM_INVENTORY"

# Show VS Code Copilot interactive-session data from a workspace state DB.
bash scripts/agent-threads.sh show --db "$STATE_VSCDB" --key memento/interactive-session
```

Source filters for `subjects`:

- `codex`
- `t3-code`
- `codex-cli`
- `copilot-cli`
- `copilot-chat`
- `claude-code`
- `all`

## T3 Deep Links

- Recognize `t3cork://`, `t3cork-dev://`, and `t3cork-preview://` links. The first path ID is the **environment**, the second is the **T3 thread**. `app/new?...` links are drafts, not stored conversations.
- The helper matches the environment against the store's `environment-id`, then queries `projection_threads` and `projection_thread_messages` by thread ID. SQLite is opened read-only and includes current WAL data. Archived threads remain readable.
- `show --link` prints chronological user/assistant messages. `--include-reasoning` explicitly adds separately stored reasoning. Attachment contents, tool calls, and tool results are not included in this projected conversation; an attachment marker indicates where metadata lives.
- For a custom location, append `--t3-home /path/to/t3-base` or `--db /path/to/state.sqlite` to `resolve`/`show`. A link still requires a matching sibling `environment-id`. For a known database without that file, use `resolve --db /path/to/state.sqlite --thread THREAD_ID` or `show --db /path/to/state.sqlite --thread THREAD_ID`. Multiple matching stores require `--db` rather than an arbitrary choice.
- If no matching local environment exists, report the checked stores and read the data on its known remote host when access is available. A deep link does not itself supply a server address or authorization; do not scan unrelated machines or open the desktop app just to resolve it.
- For tool-level evidence, `resolve` returns `provider_name`, `provider_instance_id`, and `native_session_id` from T3's session/runtime mapping. Claude's native session comes from `resume_cursor_json.resume`; Codex's comes from `resume_cursor_json.threadId`. Locate that ID in the corresponding account's native store. The T3 thread ID and native session ID can differ, and a default account's store may not contain another provider instance's transcript. Missing native logs do not prevent reading the projected conversation.

## Response Guidelines

- For “what are the latest subjects?” report titles/snippets only, grouped by source.
- For “where is this stored?” include exact local paths and, for VS Code, the SQLite key when relevant.
- For T3 results, include the thread title, original deep link, and database path when useful. Distinguish projected messages from native tool traces.
- For transcript inspection, summarize the relevant turns unless the user asks for raw output.
- Treat transcripts as sensitive local data. Do not print long private messages, tokens, env vars, or credentials unless the user explicitly asks and the content is necessary.
- If a source has no title, derive a subject from the first non-boilerplate user message.

## Manual Fallback

If the helper script cannot run, inspect stores directly:

```bash
# T3: compare the environment first, then use the T3 thread ID in that store.
cat "$T3_STATE_DIR/environment-id"
sqlite3 -readonly "$T3_STATE_DIR/state.sqlite" 'select thread_id, title from projection_threads;'

jq -r '.thread_name // .title // empty' ~/.codex/session_index.jsonl
find ~/.claude/projects -name '*.jsonl'
find ~/.copilot/session-state -name events.jsonl
sqlite3 "$STATE_VSCDB" "select key, length(value) from ItemTable where lower(key) like '%chat%' or lower(key) like '%copilot%';"
```
