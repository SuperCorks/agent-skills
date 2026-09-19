#!/usr/bin/env python3
"""Codex hook adapter: explicit scope checks, native hooks, and queued capture.

Keep stdout strictly in Codex's hook protocol. Credentials are resolved only
inside this process, never embedded in hook definitions or diagnostic output.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

SCOPED_TOOLS = {
    "memory_query", "memory_briefing", "memory_recent", "memory_explore",
    "memory_read_page", "memory_write_page", "memory_delete_page",
    "memory_read_session_observations", "memory_feedback", "memory_lint",
    "memory_auto_improve", "memory_forget_sweep", "memory_handoff_begin",
    "memory_handoff_accept", "memory_handoff_cancel",
}


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def complete_scope(value):
    return isinstance(value, dict) and all(nonempty(value.get(k)) for k in ("workspace", "project"))


def scope_guard(event, payload):
    """Reject ambiguous project reads/writes; never impose general read quotas."""
    name = payload.get("tool_name", "")
    if event != "PreToolUse" or not isinstance(name, str):
        return None
    normalized = name.replace("-", "_")
    if not re.search(r"(?:^|__)ai_memory__", normalized):
        return None
    tool = normalized.rsplit("__", 1)[-1]
    if tool not in SCOPED_TOOLS:
        return None
    args = payload.get("tool_input", {})
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            args = {}
    valid = False
    if isinstance(args, dict):
        pair_present = "workspace" in args or "project" in args
        scopes_present = args.get("scopes") not in (None, [])
        global_requested = args.get("global") is True
        if tool == "memory_write_page" and args.get("scope") == "global":
            valid = not pair_present and not scopes_present and "global" not in args
        elif "scope" in args and args.get("scope") not in {None, "project"}:
            valid = False
        elif global_requested:
            valid = tool == "memory_query" and not pair_present and not scopes_present
        elif scopes_present:
            scopes = args["scopes"]
            valid = tool == "memory_query" and not pair_present and isinstance(scopes, list) and bool(scopes) and all(complete_scope(s) for s in scopes)
        else:
            valid = complete_scope(args)
    if valid:
        return None
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": (
            "ai-memory requires an explicit nonempty workspace and project. memory_query "
            "also accepts nonempty complete scopes, or global=true alone for intentional "
            "cross-project searches. memory_write_page uses scope='global' alone for an "
            "authorized global preference. Resolve the repository's .ai-memory.toml; "
            "do not rely on the shared server's current-project pointer."
        ),
    }}


def note_failure(config, component, error, **context):
    """Metadata only. See agent_memory.diagnostics for what is safe to record."""
    try:
        from agent_memory import diagnostics
        diagnostics.note(config, component, error, **context)
    except Exception:  # noqa: BLE001 - diagnostics must never break a hook
        pass


def native_hook(config, event, payload):
    """Preserve bounded native capture/briefings; fuller capture is independent."""
    from native_hooks import briefing, enqueue
    query = enqueue(config, event, payload)
    return briefing(config, query, payload["session_id"]) if event == "SessionStart" and query else {}


def arguments(argv):
    """`<Event>` for Codex, `<Event> --agent claude-code` for Claude Code."""
    event = argv[1] if len(argv) >= 2 else ""
    agent = argv[3] if len(argv) == 4 and argv[2] == "--agent" else "codex"
    return event, agent if agent in {"codex", "claude-code"} else "codex"


def main():
    event, agent = arguments(sys.argv)
    if event == "--drain-native":
        from agent_memory.config import Config, MemoryError
        from native_hooks import drain
        config = Config.load()
        try:
            drain(config)
        except Exception as error:
            note_failure(config, "native-drain", error, agent="codex")
            return 1
        return 0
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("invalid hook payload")
    except (ValueError, OSError):
        print("{}")
        return 0
    # Claude Code already runs ai-memory's native lifecycle hook, which owns the
    # bounded observations, the briefing, and its own tool-scope policy. Here it
    # only needs the fuller transcript capture.
    lifecycle = agent == "codex"
    denied = scope_guard(event, payload) if lifecycle else None
    if denied:
        print(json.dumps(denied))
        return 0
    output = {}
    try:
        from agent_memory.config import Config, MemoryError
        from agent_memory.capture import hook
        config = Config.load()
    except Exception:
        # An unavailable companion must not block unrelated coding. doctor and
        # the explicit native activation canary are the installation health gate.
        print("{}")
        return 0
    try:
        scope = config.resolve_scope(payload.get("cwd", ""))
    except MemoryError:
        # Global hook definitions also run in unrelated projects. Expected scope
        # rejection is not a broken capture queue and must not flood error logs.
        pass
    else:
        try:
            hook(config, event, payload, spawn=True)
        except Exception as error:
            note_failure(config, "capture", error, event=event, payload=payload, scope=scope, agent=agent)
    if lifecycle:
        try:
            output = native_hook(config, event, payload)
        except Exception as error:
            note_failure(config, "native-hook", error, event=event, payload=payload, agent=agent)
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
