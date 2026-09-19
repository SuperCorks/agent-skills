"""Local fault log for hooks and drains: metadata only, never payload text.

MemoryError messages are static source literals (a test enforces it), so they
are safe to record and are what makes a failure diagnosable. Any other
exception may quote a path, credential, or transcript, so only its type and a
numeric status survive. Expected refusals (CaptureSkip) are counted apart from
faults: they explain a coverage gap without making the host look unhealthy.
"""
import json
import os
import time
import traceback
from pathlib import Path

from .config import CaptureSkip, MemoryError

ERRORS = "hook-errors.jsonl"
SKIPS = "hook-skips.jsonl"
ROTATE_BYTES = 4 * 1024 * 1024
PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def raise_site(error):
    """Innermost frame inside this companion, as file:line. Never a payload value."""
    site = None
    for frame in traceback.extract_tb(error.__traceback__):
        path = Path(frame.filename)
        if PACKAGE_ROOT in path.parents:
            site = path.name + ":" + str(frame.lineno)
    return site


def entry(component, error, event=None, payload=None, scope=None, agent=None):
    record = {"time": time.time(), "component": component, "error_type": type(error).__name__}
    if isinstance(error, MemoryError):
        record["message"] = str(error)[:300]
    for name in ("status", "errno"):
        value = getattr(error, name, None)
        if type(value) is int:
            record[name] = value
    site = raise_site(error)
    if site:
        record["where"] = site
    if event:
        record["event"] = str(event)[:64]
    if agent:
        record["agent"] = str(agent)[:64]
    if isinstance(payload, dict) and isinstance(payload.get("session_id"), str):
        record["session_id"] = payload["session_id"][:128]
    if isinstance(scope, dict):
        record["scope"] = {key: str(scope.get(key))[:256] for key in ("workspace", "project")}
    return record


def note(config, component, error, **context):
    """Append one record. Never raises: diagnostics must not break a hook."""
    try:
        config.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        target = config.state_dir / (SKIPS if isinstance(error, CaptureSkip) else ERRORS)
        try:
            if target.stat().st_size > ROTATE_BYTES:
                os.replace(target, target.with_name(target.name + ".1"))
        except FileNotFoundError:
            pass
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(descriptor, "a") as stream:
            stream.write(json.dumps(entry(component, error, **context), sort_keys=True) + "\n")
    except Exception:  # noqa: BLE001 - see docstring
        pass


def load(config, name, since=0.0):
    records = []
    for path in (config.state_dir / (name + ".1"), config.state_dir / name):
        try:
            lines = path.read_text().splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                item = json.loads(line)
            except ValueError:
                continue
            if isinstance(item, dict) and type(item.get("time")) in (int, float) and item["time"] >= since:
                records.append(item)
    return records


def label(item):
    """Group key: the static message when known, otherwise the exception type."""
    return item.get("message") or item.get("error_type") or "unknown"


def grouped(records, limit=8):
    groups = {}
    for item in records:
        key = (item.get("component"), label(item))
        group = groups.setdefault(key, {"component": key[0], "error": key[1], "count": 0, "sessions": set(),
                                        "agents": set(), "scopes": set(), "where": set(),
                                        "first": item["time"], "last": item["time"]})
        group["count"] += 1
        group["first"], group["last"] = min(group["first"], item["time"]), max(group["last"], item["time"])
        for field, source in (("sessions", item.get("session_id")), ("agents", item.get("agent")),
                              ("where", item.get("where"))):
            if source:
                group[field].add(source)
        if isinstance(item.get("scope"), dict):
            group["scopes"].add(str(item["scope"].get("workspace")) + "/" + str(item["scope"].get("project")))
    ordered = sorted(groups.values(), key=lambda group: -group["count"])[:limit]
    return [{"component": group["component"], "error": group["error"], "count": group["count"],
             "distinct_sessions": len(group["sessions"]), "agents": sorted(group["agents"]),
             "scopes": sorted(group["scopes"])[:6], "where": sorted(group["where"])[:4],
             "first_at": stamp(group["first"]), "last_at": stamp(group["last"])} for group in ordered]


def stamp(value):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(value))


def summary(config, days=7):
    """Windowed view for doctor and `agent-memory errors`."""
    current = time.time()
    since = current - days * 86400
    errors, skips = load(config, ERRORS, since), load(config, SKIPS, since)
    day = [item for item in errors if item["time"] >= current - 86400]
    sessions = {}
    for item in errors:
        if item.get("session_id"):
            sessions[item["session_id"]] = sessions.get(item["session_id"], 0) + 1
    return {"window_days": days, "errors": len(errors), "errors_last_24h": len(day),
            "expected_skips": len(skips), "error_groups": grouped(errors),
            "error_groups_last_24h": grouped(day, 5), "skip_groups": grouped(skips, 5),
            "noisiest_sessions": [{"session_id": key, "errors": value} for key, value in
                                  sorted(sessions.items(), key=lambda pair: -pair[1])[:5]],
            "undiagnosable": sum(1 for item in errors if not item.get("message") and not item.get("where"))}
