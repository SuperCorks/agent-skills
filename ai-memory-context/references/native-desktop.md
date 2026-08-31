# Native Codex Desktop capture

This adapter targets ai-memory 1.28.1 and Python 3.11+. It uses the existing
workstream APIs; the server and its database do not need a fork. It complements
bounded lifecycle observations with future visible transcript events.

## Boundaries

- One stable `(workspace, project)` per Git repository, including every clone
  and worktree. Parent-started cross-repository tasks use an explicit parent
  meta-project. Nested tool working directories do not change task ownership.
- One stable host ID per machine. One workstream per host/native task. Short
  completed import runs checkpoint progress without pretending the task ended.
- No historical import by default. `capture init` establishes an EOF boundary
  for existing rollouts. New native SessionStart enrollment excludes an
  inherited fork prefix. Unknown forks without enrollment fail closed and
  report a coverage gap. Do not reset state to “fix” a backlog.
- Only visible user, assistant, and tool content is normalized. Hidden
  reasoning is excluded. Large events may be chunked; terminal output already
  truncated by Codex cannot be reconstructed. A crash or unreadable rollout
  can create gaps, which must be reported rather than called complete capture.
- Capture and retrieval are separate: native `memory_query` does not search
  the workstream ledger. The companion finds metadata-only session descriptor
  pages in explicit scopes, then reads/searches the referenced event streams.
- Do not enable embeddings, background consolidation, or historical backfill
  as part of installation. Those are separate decisions.

## Host configuration

Install only in the canonical global skills checkout, `~/.agents/skills`.
The executable is `~/.local/bin/agent-memory`; no duplicate global skill copies
belong in `~/.codex/skills` or `~/.claude/skills`.

Use `~/.config/agent-memory/config.json` (override with `AGENT_MEMORY_CONFIG`):

```json
{
  "server_url": "https://memory.example.com",
  "host_id": "laptop",
  "auth_command": ["/usr/bin/security", "find-generic-password", "-w", "-s", "memory token"],
  "registry_key_file": "/absolute/private/registry-signing-key",
  "registry_key_id": "context-registry-v1",
  "allowed_scopes": [
    {"workspace": "team/kernel", "project": "kernel", "roots": ["/absolute/kernel"]},
    {"workspace": "team/kernel", "project": "nextjs", "parent": {"workspace": "team/kernel", "project": "kernel"}}
  ]
}
```

On Linux, use `"token_file": "/home/agent/.config/agent-memory/token"` instead
of the Keychain command; keep it mode 0600. A process-scoped
`AI_MEMORY_AUTH_TOKEN` is also supported. Never put a credential in a hook
command, command-line argument, transcript, repository, or diagnostic report.
`state_dir` defaults to `~/.local/state/agent-memory`; it contains private
capture offsets, queue state, locks, telemetry, and installation backups.

Use one separate 32-byte random signing key, encoded as 64 hexadecimal
characters, on all configured hosts; keep its file mode 0600. This is not the
server authentication token and must not change during routine token rotation.
`registry_key_command` can resolve it from a credential store instead.
Session descriptors carry signed ingestion receipts, so editable memory pages
cannot redirect a scoped search to another workstream. ai-memory 1.28.1 exposes
no read-only workstream-scope metadata endpoint: the receipt proves the trusted
ingester's explicit scope association, not an independent server authorization
check. Unsigned, modified, or unknown-key descriptors are rejected visibly.

`allowed_scopes` governs fuller capture and companion retrieval. Optional
`native_allowed_scopes` can separately preserve explicitly listed existing
projects' bounded lifecycle capture; it defaults to `allowed_scopes`. Unknown
scopes fail closed rather than creating basename-derived projects. The native
adapter queues authenticated HTTP batches without putting tokens in argv.
The native CLI is used only for its read-only capture-policy inspection.

Preview then apply:

```sh
python3 ~/.agents/skills/ai-memory-context/scripts/install-context.py --config-template /absolute/config.json
python3 ~/.agents/skills/ai-memory-context/scripts/install-context.py --config-template /absolute/config.json --apply
agent-memory capture init --json
agent-memory doctor --repo /absolute/repository --json
```

The installer preserves unrelated hooks/settings, replaces only the native
ai-memory adapter hooks, makes global Serena stdio unbound, and removes the
global Graphify MCP registration. It backs up changed files. It does **not**
approve hooks, restart tasks, or backfill data. Review the changed definitions
through Codex's supported `/hooks` or app hook settings. Never edit trust hashes
or disable trust checks to make installation look successful.

Reconnect/restart the affected MCP sessions after changing server definitions.
Existing tasks may retain their old server processes or cached hook definitions.
Repository-level configuration can override global settings; update only the
repositories in scope, and never mutate another active task's worktree.
For a reused worktree created before the workflow update, its owning task must
first integrate the updated repository baseline using that project's Git
workflow, preserving its in-progress changes. Then rerun the context doctor
and review/reload hooks and MCP connections. Updating the primary checkout
alone does not update another worktree's tracked configuration.

## Native activation canary

Run this in an actual supported Codex task after approval/reload, not merely by
piping a synthetic payload into the router:

1. Send a unique, nonsecret user canary string in the intended repository.
2. Have the assistant issue one harmless command and return a distinct canary.
3. Allow the Stop hook to enqueue/drain. Read `doctor` for queue/errors/coverage.
4. Search the exact scope; read the returned session and verify the user text,
   assistant text, tool input, and tool output. Prove wrong-scope searches do not
   return it. Test a resume and one fresh worktree too.
5. Treat a direct API test, fixture test, or successful manual drain as partial
   evidence only. It does not establish native hook activation.

## Retrieval and recovery

```sh
agent-memory search "prior decision" --repo /absolute/repository --json
agent-memory search "workspace coordination" --repo /absolute/repository --include-parent --json
agent-memory read-session SESSION_ID --repo /absolute/repository --json
agent-memory capture drain --json
agent-memory report --repo /absolute/repository --days 7 --json
```

Search without `--include-parent` stays in the exact repository scope.
`--include-workspace` is an alias for the configured parent inclusion, not an
unrestricted global search. A metadata descriptor registry makes workstreams
discoverable across configured hosts without a shared mutable index page.

For backlog or failure, preserve offsets and retry the durable queue. Check
credentials, connectivity, explicit markers/allowlist, and native hook trust.
An allowlisted scope with working server authentication can report
`scope_exists: false` before its first capture. ai-memory 1.28.1 creates the
explicit project on the first admitted lifecycle event or managed import.
Treat this as awaiting first capture; do not create dummy pages or replay
fabricated hooks just to make the doctor green. If the project is still absent
after an acknowledged capture, investigate routing and delivery.
Each drain invocation forwards at most 32 native lifecycle observations; repeat
while the native pending count decreases. Observations older than 28 days are
held for operator review because upstream retry deduplication expires; do not
blindly replay that backlog. Fuller workstream imports use their own stable
event identities and queue.
Report unsupported event shapes, missing enrollment, truncated/rewritten files,
and stale queued work. Never silently skip content or advance a cursor before
the server confirms it. Do not replay old lifecycle hook payloads to import
history or manually finalize an arbitrary active session.

Uninstall by restoring the exact installation backups/reconciling the affected
hook entries; preserve unrelated changes made since installation. Disabling
hooks stops new capture but does not delete already recorded memory.
