"""Metadata-only operational telemetry: never prompts, arguments, or result text."""
import json
import shlex
import statistics
import time
from pathlib import Path
from collections import Counter
from datetime import datetime, timedelta, timezone

from .config import scope_key
from .storage import locked, now, private_dir, read_json, write_json


def layer(name):
    if "serena" in name:
        return "serena"
    if "graphify" in name:
        return "graphify"
    if "ai_memory" in name or "ai-memory" in name or "agent-memory" in name:
        return "ai-memory"
    return "other"


def classify(name, tool_input):
    """Recognize direct CLI invocations without persisting command text.

    Compound shell commands, shell wrappers, and generated JavaScript are
    deliberately unclassified: guessing from substrings miscounts quoted text.
    """
    native_layer = layer(name)
    if native_layer != "other":
        return native_layer, name.rsplit("__", 1)[-1].removeprefix("memory_")
    if not isinstance(tool_input, dict):
        return "other", "unclassified"
    command = tool_input.get("cmd", tool_input.get("command"))
    if not isinstance(command, str):
        return "other", "unclassified"
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars="();<>|&")
        lexer.whitespace_split = True
        argv = list(lexer)
    except ValueError:
        return "other", "unclassified"
    if (not argv or any(token and all(char in "();<>|&" for char in token) for token in argv)
            or "\n" in command or "$(" in command or "`" in command):
        return "other", "unclassified"
    executable = Path(argv[0]).name
    if executable == "graphify" and len(argv) > 1:
        return "graphify", argv[1] if argv[1] in {"query", "path", "explain", "check-update", "update", "build"} else "other"
    if executable == "agent-context" and len(argv) > 2 and argv[1] == "graph":
        return "graphify", argv[2] if argv[2] in {"query", "path", "explain", "check", "refresh"} else "other"
    if executable == "agent-memory" and len(argv) > 1:
        return "ai-memory", argv[1] if argv[1] in {"search", "query", "read", "read-session", "doctor", "report", "capture"} else "other"
    if executable == "rg":
        return "literal", "search"
    return "other", "unclassified"


def record(config, event, payload, scope=None):
    name = str(payload.get("tool_name", ""))[:240]
    call_id = str(payload.get("tool_use_id", payload.get("tool_call_id", payload.get("call_id", ""))))[:512]
    session_id = str(payload.get("session_id", ""))[:512]
    directory = private_dir(config.state_dir / "telemetry")
    stamp = now()
    selected_layer, operation = classify(name, payload.get("tool_input"))
    entry = {"at": stamp, "event": event, "session_id": session_id, "tool": name,
             "call_id": call_id, "layer": selected_layer, "operation": operation, "scope": scope, "status": "unknown"}
    key = session_id + ":" + call_id
    with locked(directory / "lock"):
        pending = read_json(directory / "pending.json", {})
        if event == "PreToolUse" and call_id:
            pending[key] = time.time()
        if event in {"PostToolUse", "PostToolUseFailure"}:
            if key in pending:
                entry["duration_ms"] = max(0, round((time.time() - pending.pop(key)) * 1000))
            response = payload.get("tool_response", payload.get("tool_result", {}))
            entry["status"] = "error" if event == "PostToolUseFailure" else "completed"
            if isinstance(response, dict):
                if response.get("isError") is True or response.get("is_error") is True or response.get("exit_code", 0) not in (None, 0):
                    entry["status"] = "error"
            encoded = json.dumps(response, ensure_ascii=False)
            entry["response_bytes"] = len(encoded.encode())
            entry["truncated"] = any(text in encoded for text in
                                      ("The answer is too long", "Output truncated", "[truncated by ai-memory]"))
        # Bound unmatched calls without retaining tool arguments.
        pending = {key: value for key, value in pending.items() if value > time.time() - 86400}
        write_json(directory / "pending.json", pending)
        with (directory / (stamp[:10] + ".jsonl")).open("a") as handle:
            import os
            os.chmod(handle.name, 0o600)
            handle.write(json.dumps(entry, sort_keys=True) + "\n")
    return entry


def report(config, scope=None, days=14):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    calls = []
    for path in sorted((config.state_dir / "telemetry").glob("????-??-??.jsonl")):
        if path.stem < cutoff.date().isoformat():
            continue
        for line in path.read_text().splitlines():
            try:
                item = json.loads(line)
            except ValueError:
                continue
            if scope and (not item.get("scope") or scope_key(item["scope"]) != scope_key(scope)):
                continue
            if item.get("event") in {"PostToolUse", "PostToolUseFailure"}:
                calls.append(item)
    layers = {}
    for name in sorted({item["layer"] for item in calls}):
        subset = [item for item in calls if item["layer"] == name]
        durations = sorted(item["duration_ms"] for item in subset if "duration_ms" in item)
        layers[name] = {"calls": len(subset), "errors": sum(item["status"] == "error" for item in subset),
                        "operations": dict(Counter(item.get("operation", "unknown") for item in subset)),
                        "retrieval_calls": sum(item.get("operation") in {"query", "path", "explain", "search", "read", "read-session",
                            "read_page", "read_session_observations", "find_symbol", "find_referencing_symbols", "get_symbols_overview", "search_for_pattern"} for item in subset),
                        "truncations": sum(bool(item.get("truncated")) for item in subset),
                        "timed_calls": len(durations),
                        "median_ms": statistics.median(durations) if durations else None,
                        "p95_ms": durations[min(len(durations) - 1, int(len(durations) * .95))] if durations else None}
    return {"days": days, "scope": scope, "layers": layers,
            "limitations": ["Timing is tool elapsed time, not time to sufficient evidence.",
                            "Completed calls are not proof of useful retrieval.",
                            "Only trusted hooks that actually fired are observed.",
                            "CLI classification covers direct invocations, not compound shells or generated JavaScript."]}
