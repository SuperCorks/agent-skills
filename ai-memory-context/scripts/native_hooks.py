"""Bounded native lifecycle forwarding without credential-bearing CLI arguments.

The wire contract is ai-memory v1.28.1 /hook/batch and /handoff. Fuller visible
transcript capture is a separate queue. Never replay these observations as a
historical import: server idempotency retention is finite.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import time
import tomllib
import urllib.parse
import urllib.request
import uuid

from agent_memory.api import Client, NoRedirect
from agent_memory.config import Config, MemoryError
from agent_memory.storage import locked, private_dir, read_json, write_json

EVENTS = {"SessionStart": "session-start", "UserPromptSubmit": "user-prompt-submit",
          "PreToolUse": "pre-tool-use", "PostToolUse": "post-tool-use",
          "PreCompact": "pre-compact", "Stop": "stop", "SessionEnd": "session-end"}


def bounded(value, maximum):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text.encode()[:maximum].decode("utf-8", errors="ignore")


def bounded_body(payload):
    body = {}
    for key in ("session_id", "cwd", "tool_name", "tool_call_id", "tool_use_id", "turn_id",
                "hook_event_name", "source", "reason", "agent_id", "agent_type"):
        if isinstance(payload.get(key), str):
            body[key] = bounded(payload[key], 4096 if key == "cwd" else 512)
    for key in ("prompt", "summary", "compaction_summary"):
        if key in payload:
            body[key] = bounded(payload[key], 16384)
    for key in ("tool_input", "tool_response", "tool_result"):
        if key in payload:
            value = payload[key]
            if len(json.dumps(value, ensure_ascii=False).encode()) <= 2048:
                body[key] = value
            else:
                # Budget JSON escaping as well as raw UTF-8.
                text = bounded(value, 1900)
                while len(json.dumps(text).encode()) > 2048:
                    text = text[:max(1, len(text) // 2)]
                body[key] = text
    return body


def marker_context(cwd):
    path = Path(cwd).expanduser().resolve()
    if not path.is_dir():
        raise MemoryError("Native hook cwd is unavailable")
    marker = {}
    for ancestor in (path, *path.parents):
        candidate = ancestor / ".ai-memory.toml"
        if candidate.exists():
            marker = tomllib.loads(candidate.read_text())
            break
        if ancestor == Path.home():
            break
    query = {"cwd": str(path)}
    if isinstance(marker.get("workspace"), str) and marker["workspace"].strip():
        query["workspace"] = marker["workspace"]
    if isinstance(marker.get("project"), str) and marker["project"].strip():
        query.update(project=marker["project"], project_src="marker")
    else:
        result = subprocess.run(["git", "-C", str(path), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                capture_output=True, text=True, timeout=0.5)
        if result.returncode == 0:
            query.update(project=Path(result.stdout.strip()).parent.name, project_src="repo-root")
        else:
            query["project"] = path.name
    if marker.get("drop_subagent_captures"):
        query["drop_subagent"] = str(marker["drop_subagent_captures"]).lower()
    briefing = marker.get("briefing", {})
    if str(briefing.get("inject_on_session_start", "")).lower() in {"1", "true"}:
        query["briefing"] = "true"
        query["briefing_budget"] = min(8000, max(0, int(briefing.get("max_chars", 4000))))
    return query


def capture_body(config, event, payload):
    body = bounded_body(payload)
    if event not in {"PreToolUse", "PostToolUse"}:
        return body
    # Reuse the installed CLI's marker ignore-path policy without spooling,
    # authentication, network access, or reimplementing its glob semantics.
    result = subprocess.run(["ai-memory", "hook", "--agent", "codex", "--event", EVENTS[event],
                             "--server-url", config.server_url, "--check-capture"],
                            input=json.dumps(payload), capture_output=True, text=True, timeout=0.7)
    if result.returncode:
        raise MemoryError("Native capture policy inspection failed")
    policy = json.loads(result.stdout)
    if policy.get("disposition") == "drop":
        return None
    if policy.get("disposition") == "metadata-only":
        return {key: body[key] for key in ("session_id", "cwd", "tool_name", "tool_call_id") if key in body}
    if policy.get("disposition") != "keep":
        raise MemoryError("Unsupported native capture policy response")
    return body


def enqueue(config, event, payload, spawn=True):
    if event not in EVENTS or not isinstance(payload.get("cwd"), str) or not payload.get("session_id"):
        return None
    # Native bounded capture may explicitly preserve other existing projects;
    # fuller Desktop transcript capture has its own narrower allowlist.
    native_config = Config({**config.data, "allowed_scopes": config.data.get("native_allowed_scopes", config.scopes)})
    try:
        scope = native_config.resolve_scope(payload["cwd"])
    except MemoryError:
        return None
    query = {**marker_context(payload["cwd"]), **scope, "project_src": "marker"}
    body = capture_body(config, event, payload)
    if body is None:
        return None
    key = uuid.uuid4().hex
    query.update(event=EVENTS[event], agent="codex", ingest_key=key)
    queue = private_dir(config.state_dir / "native-hooks")
    write_json(queue / f"{time.time_ns():020d}-{key}.json",
               {"url": config.server_url + "/hook?" + urllib.parse.urlencode(query), "body": body})
    if spawn:
        subprocess.Popen([sys.executable, str(Path(__file__).with_name("context_hook.py")), "--drain-native"],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)
    return query


def drain(config, client=None):
    queue = private_dir(config.state_dir / "native-hooks")
    with locked(config.state_dir / "native-hooks.lock", blocking=False) as lease:
        if not lease:
            return 0
        paths = sorted(queue.glob("*.json"))[:32]
        if not paths:
            return 0
        if any(time.time() - path.stat().st_mtime > 28 * 86400 for path in paths):
            raise MemoryError("Native hook backlog exceeds safe deduplication age; operator review required")
        entries = [read_json(path) for path in paths]
        if any(not entry.get("url", "").startswith(config.server_url + "/hook?") for entry in entries):
            raise MemoryError("Native queue belongs to a different server")
        ack = (client or Client(config)).request("POST", "/hook/batch", entries)
        indices = ack.get("accepted_indices")
        if indices is None:
            count = ack.get("accepted", 0)
            if type(count) is not int or not 0 <= count <= len(paths):
                raise MemoryError("Invalid native batch acknowledgement")
            indices = list(range(count))
        if not isinstance(indices, list) or any(type(i) is not int or not 0 <= i < len(paths) for i in indices):
            raise MemoryError("Invalid native batch acknowledgement")
        for index in set(indices):
            paths[index].unlink()
        return len(set(indices))


def briefing(config, query, session_id):
    params = {k: v for k, v in query.items() if k not in {"event", "ingest_key"}}
    params["session_id"] = session_id
    request = urllib.request.Request(config.server_url + "/handoff?" + urllib.parse.urlencode(params),
                                     headers={"Authorization": "Bearer " + config.token()})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=1) as response:
        text = response.read(32768).decode("utf-8", errors="replace")
    return {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text}} if text else {}
