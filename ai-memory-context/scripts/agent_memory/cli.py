"""Supported command interfaces. Normal output is JSON; secrets are never printed."""
import argparse
import json
import sys
import time

from . import VERSION, capture, diagnostics, retrieval, telemetry
from .api import Client, array
from .config import Config, MemoryError
from .storage import now, read_json, write_json


def doctor(config, repo=None):
    boundary = read_json(config.state_dir / "activation.json")
    last = read_json(config.state_dir / "last-drain.json", {})
    sessions = [read_json(path) for path in (config.state_dir / "sessions").glob("*.json")]
    native_pending = list((config.state_dir / "native-hooks").glob("*.json"))
    hook_errors = diagnostics.load(config, diagnostics.ERRORS)
    recent = diagnostics.summary(config, days=7)
    result = {"version": VERSION, "protocol": "ai-memory-1.28.1", "host_id": config.host_id,
              "capture_initialized": bool(boundary), "activated_at": boundary.get("activated_at") if boundary else None,
              "queued_sessions": len(list((config.state_dir / "queue").glob("*.json"))),
              "native_hook_queue": {"pending": len(native_pending), "oldest_age_seconds":
                  round(time.time() - min(path.stat().st_mtime for path in native_pending)) if native_pending else None},
              "hook_error_count": len(hook_errors), "latest_hook_error": hook_errors[-1] if hook_errors else None,
              "diagnostics": recent, "capture_by_agent": capture_by_agent(sessions),
              "observed_native_sessions": len(sessions),
              "captured_visible_events": sum(item.get("imported_events", 0) for item in sessions),
              "last_drain": last, "losses": sorted({loss for item in sessions for loss in item.get("losses", [])}),
              "last_hook_error": read_json(config.state_dir / "last-hook-error.json"),
              "limitations": ["Installed hooks are not proof of Codex trust or dispatch.",
                              "Use an actual native task canary and scoped read-back to prove capture."]}
    scope = config.resolve_scope(repo) if repo else None
    try:
        config.registry_key()
        result["registry_receipt_key_ready"] = True
    except MemoryError as error:
        result.update({"registry_receipt_key_ready": False, "registry_receipt_key_error": str(error)})
    try:
        client = Client(config)
        response = client.request("GET", "/api/v1/projects", query={"workspace": scope["workspace"]} if scope else None)
        result["server_readable"] = True
        if scope:
            result["scope"] = scope
            projects = array(response, "projects")
            result["scope_exists"] = any(item.get("project_name", item.get("project")) == scope["project"] for item in projects)
    except MemoryError as error:
        result.update({"server_readable": False, "server_error": str(error)})
    result["status"] = "ready" if all((result["capture_initialized"], result["server_readable"],
        result["registry_receipt_key_ready"], result.get("scope_exists", True))) else "degraded"
    # Attention means something is wrong now. All-time totals and the losses
    # every mid-session enrollment records stay visible above, but a status
    # that can never return to ready detects nothing.
    reasons = []
    if recent["errors_last_24h"]:
        reasons.append("hook_or_drain_errors_last_24h")
    stuck = [path for path in (config.state_dir / "queue").glob("*.json")
             if time.time() - path.stat().st_mtime > STUCK_SECONDS]
    if stuck:
        reasons.append("capture_queue_older_than_30_minutes")
    if native_pending and time.time() - min(path.stat().st_mtime for path in native_pending) > STUCK_SECONDS:
        reasons.append("native_hook_queue_older_than_30_minutes")
    if result["last_hook_error"]:
        reasons.append("last_hook_error_present")
    result["attention_reasons"] = reasons
    if reasons and result["status"] == "ready":
        result["status"] = "attention"
    return result


STUCK_SECONDS = 1800


def capture_by_agent(sessions, days=7):
    """Silent failure shows up as hooks arriving while nothing is imported."""
    since = time.time() - days * 86400
    agents = {}
    for item in sessions:
        if not isinstance(item, dict):
            continue
        agent = agents.setdefault(item.get("agent", "codex"), {
            "sessions": 0, "sessions_active_last_7d": 0, "active_sessions_with_imports": 0,
            "imported_events": 0, "last_hook_at": None, "last_import_at": None})
        agent["sessions"] += 1
        agent["imported_events"] += item.get("imported_events", 0)
        for field, source in (("last_hook_at", "last_hook_at"), ("last_import_at", "last_import_at")):
            value = item.get(source)
            if isinstance(value, str) and (agent[field] is None or value > agent[field]):
                agent[field] = value
        if isinstance(item.get("last_hook_at"), str) and item["last_hook_at"] >= diagnostics.stamp(since):
            agent["sessions_active_last_7d"] += 1
            agent["active_sessions_with_imports"] += 1 if item.get("imported_events") else 0
    return agents


def parser():
    root = argparse.ArgumentParser(description="Explicitly scoped ai-memory Desktop capture and retrieval (future events only)")
    root.add_argument("--config", help="Host config JSON (default AGENT_MEMORY_CONFIG or ~/.config/agent-memory/config.json)")
    commands = root.add_subparsers(dest="command", required=True)
    cap = commands.add_parser("capture")
    operations = cap.add_subparsers(dest="operation", required=True)
    init = operations.add_parser("init", help="Baseline existing native history; never import it or reset existing activation")
    init.add_argument("--json", action="store_true")
    hook = operations.add_parser("hook", help="Receive native hook JSON on stdin; stdout remains valid Codex hook JSON")
    hook.add_argument("event")
    hook.add_argument("--no-spawn", action="store_true", help="Queue only (offline tests/manual drain)")
    drain = operations.add_parser("drain", help="Drain durable queue in bounded short managed runs")
    drain.add_argument("--session-id")
    drain.add_argument("--json", action="store_true")
    for name in ("search", "query", "read-session", "read", "doctor", "report", "errors"):
        command = commands.add_parser(name, help="Group recent hook and drain faults by cause, without payload text"
                                      if name == "errors" else None)
        command.add_argument("--repo", required=name not in {"doctor", "report", "errors"})
        command.add_argument("--json", action="store_true")
        if name in {"search", "query", "read-session", "read"}:
            command.add_argument("--include-parent", "--include-workspace", dest="include_parent", action="store_true")
            command.add_argument("--limit", type=int, default=20 if name in {"search", "query"} else 100)
        if name in {"search", "query"}:
            command.add_argument("query")
        if name == "read-session":
            command.add_argument("session_id")
        if name == "read":
            command.add_argument("--session", dest="session_id", required=True)
        if name in {"report", "errors"}:
            command.add_argument("--days", type=int, default=14 if name == "report" else 7)
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    is_hook = args.command == "capture" and args.operation == "hook"
    config = None
    try:
        config = Config.load(args.config)
        if args.command == "capture":
            if args.operation == "init":
                result = capture.initialize(config)
            elif args.operation == "hook":
                payload = json.load(sys.stdin)
                capture.hook(config, args.event, payload, spawn=not args.no_spawn)
                print("{}")
                return 0
            else:
                result = capture.drain(config, args.session_id)
        elif args.command == "doctor":
            result = doctor(config, args.repo)
        elif args.command == "errors":
            if args.days < 1 or args.days > 366:
                raise MemoryError("days must be between1 and366")
            result = diagnostics.summary(config, args.days)
        elif args.command == "report":
            if args.days < 1 or args.days > 366:
                raise MemoryError("days must be between1 and366")
            result = telemetry.report(config, config.resolve_scope(args.repo) if args.repo else None, args.days)
            result["capture"] = {"queued_sessions": len(list((config.state_dir / "queue").glob("*.json"))),
                                 "last_drain": read_json(config.state_dir / "last-drain.json")}
        else:
            if args.limit < 1 or args.limit > 100:
                raise MemoryError("limit must be between1 and100")
            scope = config.resolve_scope(args.repo)
            result = retrieval.search(config, args.query, scope, args.include_parent, args.limit) if args.command in {"search", "query"} else retrieval.read_session(config, args.session_id, scope, args.include_parent, args.limit)
        print(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False))
        return 1 if result.get("status") in {"pending", "degraded", "attention"} else 0
    except (MemoryError, ValueError, OSError) as error:
        message = str(error) if isinstance(error, MemoryError) else "Invalid input or unavailable local capture file"
        if is_hook:
            if config:
                write_json(config.state_dir / "last-hook-error.json", {"at": now(), "error": message})
            print("{}")
            return 0  # Optional memory must never stop the user's coding task.
        print(json.dumps({"status": "error", "error": message}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
