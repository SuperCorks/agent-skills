"""Durable event-triggered capture using short ai-memory managed import runs."""
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from .api import ApiError, Client, register_ledger
from .config import MemoryError
from .storage import digest, locked, now, private_dir, read_json, write_json
from . import telemetry, transcript


def initialize(config):
    """Establish an irreversible forward-only boundary. Never reset existing cursors."""
    with locked(config.state_dir / "init.lock"):
        existing = read_json(config.state_dir / "activation.json")
        if existing:
            return {"initialized": True, "already_initialized": True,
                    "activated_at": existing["activated_at"], "baselined_files": len(existing["files"])}
        activation = {"version": 1, "activated_at": now(), "files": {}}
        for path in transcript.files(config):
            try:
                meta = transcript.header(path)
                activation["files"][str(path)] = {**transcript.snapshot(path), "session_id": meta["id"]}
            except MemoryError:
                # Metadata cannot prove ownership. Such a file is never uploaded.
                continue
        write_json(config.state_dir / "activation.json", activation)
        return {"initialized": True, "already_initialized": False,
                "activated_at": activation["activated_at"], "baselined_files": len(activation["files"])}


def activation(config):
    result = read_json(config.state_dir / "activation.json")
    if not result:
        raise MemoryError("Capture is not initialized; run capture init before enabling hooks")
    return result


def state_path(config, session_id):
    return config.state_dir / "sessions" / (digest(session_id) + ".json")


def job_path(config, session_id):
    return config.state_dir / "queue" / (digest(session_id) + ".json")


def canonical_event(event):
    aliases = {"session-start": "SessionStart", "user-prompt-submit": "UserPromptSubmit",
               "pre-tool-use": "PreToolUse", "post-tool-use": "PostToolUse", "stop": "Stop",
               "pre-compact": "PreCompact", "session-end": "SessionEnd", "post-tool-use-failure": "PostToolUseFailure"}
    return aliases.get(event, event)


def hook(config, event, payload, spawn=True):
    """Record metadata and enqueue from actual native identity, never shell arguments.

    Return value is operational metadata, NOT Codex hook JSON. CLI emits {};
    embedding hook routers should discard this value and preserve their own output.
    """
    event = canonical_event(event)
    session_id = payload.get("session_id")
    cwd = payload.get("cwd")
    if not isinstance(session_id, str) or not session_id or len(session_id) > 512 or not isinstance(cwd, str):
        raise MemoryError("Native hook session_id and top-level cwd are required")
    scope = config.resolve_scope(cwd)
    telemetry.record(config, event, payload, scope)
    boundary = activation(config)
    raw_path = payload.get("transcript_path")
    if not isinstance(raw_path, str):
        raise MemoryError("Native hook transcript_path is required; capture cannot guess latest")
    path = transcript.allowed_path(config, raw_path)
    meta = transcript.header(path)
    if meta["id"] != session_id:
        raise MemoryError("Native hook session_id does not match the transcript header")
    key = digest(session_id)
    with locked(config.state_dir / "locks" / (key + ".lock")):
        state = read_json(state_path(config, session_id))
        new_session = state is None
        if not state:
            state = {"version": 1, "session_id": session_id, "scope": scope, "anchor_cwd": cwd,
                     "activated_at": boundary["activated_at"], "host_id": config.host_id,
                     "files": {}, "seen_event_ids": [], "losses": [], "imported_events": 0,
                     "first_observed_at": now()}
        # Session scope is frozen. A task can move worktrees; shell tool workdirs
        # and later markers never silently move already-captured history.
        config.require_scope(state["scope"])
        if str(path) not in state["files"]:
            baseline = boundary["files"].get(str(path))
            cursor = baseline
            if baseline is None:
                for old in list(state["files"].values()) + [
                        {"baseline": value, "cursor": value} for value in boundary["files"].values()
                        if value.get("session_id") == session_id]:
                    if prefix_matches(path, old["baseline"]):
                        baseline = old["baseline"]
                        cursor = old["cursor"] if prefix_matches(path, old["cursor"]) else baseline
                        break
            if baseline is None:
                # Codex may already have persisted the initial user message
                # before SessionStart runs. Fresh, non-fork startup sessions
                # created after activation can safely start at byte zero.
                try:
                    created = datetime.fromisoformat(meta.get("timestamp", "").replace("Z", "+00:00"))
                    activated = datetime.fromisoformat(boundary["activated_at"].replace("Z", "+00:00"))
                    fresh = (new_session and event == "SessionStart" and payload.get("source") == "startup"
                             and created.tzinfo is not None and created >= activated
                             and not any(meta.get(key) for key in ("forked_from_id", "forked_from", "parent_thread_id")))
                except (TypeError, ValueError):
                    fresh = False
                baseline = {"offset": 0, "prefix_sha256": digest(b"")} if fresh else transcript.snapshot(path)
                cursor = baseline
                if event != "SessionStart":
                    state["losses"] = sorted(set(state["losses"] + ["first_seen_without_session_start_prefix_excluded"]))
                elif not fresh:
                    state["losses"] = sorted(set(state["losses"] + ["unproven_start_prefix_excluded"]))
            state["files"][str(path)] = {"baseline": baseline, "cursor": cursor}
        state["last_hook_at"] = now()
        state["last_hook_event"] = event
        state["hook_count"] = state.get("hook_count", 0) + 1
        write_json(state_path(config, session_id), state)
        job = read_json(job_path(config, session_id), {"session_id": session_id, "revision": 0})
        job.update({"revision": job["revision"] + 1, "queued_at": now(), "last_event": event})
        write_json(job_path(config, session_id), job)
        threshold = max(1, int(config.data.get("tool_drain_threshold", 32)))
        should_drain = event in {"Stop", "PreCompact", "SessionEnd"} or (
            event in {"PostToolUse", "PostToolUseFailure"} and state["hook_count"] % threshold == 0)
    if spawn and should_drain:
        spawn_drain(config)
    return {"queued": True, "session_id": session_id, "scope": state["scope"], "drain_requested": should_drain}


def spawn_drain(config):
    if not config.path:
        raise MemoryError("Detached drain needs an explicit saved configuration path")
    command = [sys.executable, str(Path(__file__).resolve().parents[1] / "agent-memory"),
               "--config", str(config.path), "capture", "drain", "--json"]
    try:
        subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True)
    except OSError as error:
        raise MemoryError("Could not start detached memory drain; queued work remains durable") from error


def discover_files(config, state, boundary):
    """Find additional rollouts/archives by exact native ID and header, not title."""
    found = {Path(path) for path in state["files"] if Path(path).exists()}
    session_id = state["session_id"]
    # Native UUID spelling cannot be used as a glob without validation.
    import uuid
    try:
        uuid.UUID(session_id)
        candidates = [path for root in config.transcript_roots if root.exists()
                      for path in root.rglob("*" + session_id + "*.jsonl")]
    except ValueError:
        candidates = transcript.files(config)
    for candidate in candidates:
        try:
            candidate = transcript.allowed_path(config, candidate)
            if transcript.header(candidate)["id"] != session_id:
                continue
        except MemoryError:
            continue
        if str(candidate) not in state["files"]:
            baseline = boundary["files"].get(str(candidate))
            # Archive moves retain the prefix. Match only this native session's
            # previously established activation baseline, never another task.
            if baseline is None:
                for old in list(state["files"].values()) + [
                        {"baseline": value} for value in boundary["files"].values()
                        if value.get("session_id") == session_id]:
                    base = old["baseline"]
                    if prefix_matches(candidate, base):
                        baseline = base
                        break
            if baseline is None:
                state["losses"] = sorted(set(state["losses"] + ["unknown_rollout_requires_start_boundary"]))
                continue
            state["files"][str(candidate)] = {"baseline": baseline, "cursor": baseline}
        found.add(candidate)
    return sorted(found)


def prefix_matches(path, cursor):
    import hashlib
    with Path(path).open("rb") as handle:
        remaining = cursor["offset"]
        hasher = hashlib.sha256()
        while remaining:
            part = handle.read(min(remaining, 1024 * 1024))
            if not part:
                return False
            hasher.update(part)
            remaining -= len(part)
    return hasher.hexdigest() == cursor["prefix_sha256"]


def checkpoint(cwd):
    def git(*args):
        result = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=3)
        return result.stdout.strip() if result.returncode == 0 else None
    try:
        head = git("rev-parse", "HEAD")
        if not head:
            return {"changed_paths": []}
        status = git("status", "--porcelain", "--untracked-files=no") or ""
        return {"head": head, "branch": git("branch", "--show-current") or "detached",
                "dirty_hash": digest(status), "changed_paths": [line[3:] for line in status.splitlines()[:100]]}
    except (OSError, subprocess.SubprocessError):
        return {"changed_paths": []}


def descriptor(state):
    return {"version": 1, **state["scope"], "registry_key": state["registry_key"],
            "workstream_id": state["workstream_id"], "native_session_id": state["session_id"],
            "host_id": state["host_id"], "capture_started_at": state["activated_at"],
            "mode": "future-visible-events-only", "adapter": "codex-desktop-v1"}


def save_state(config, state):
    """Merge hook enrollment that arrived while a drain performed network I/O."""
    with locked(config.state_dir / "locks" / (digest(state["session_id"]) + ".lock")):
        latest = read_json(state_path(config, state["session_id"]), {})
        state["files"] = {**latest.get("files", {}), **state["files"]}
        for key in ("last_hook_at", "last_hook_event", "hook_count"):
            if key in latest:
                state[key] = latest[key]
        write_json(state_path(config, state["session_id"]), state)


def prepare(client, state):
    # Namespace fingerprints isolate passive imports from ai-memory run's
    # checkout selection. They stay stable if this task later moves worktrees.
    key = digest([state["scope"], state["host_id"], state["session_id"]])
    state["registry_key"] = key
    name = "desktop-" + key[:40]
    request = {**state["scope"], "cwd": state["anchor_cwd"], "agent": "codex",
               "repo_fingerprint": "desktop-v1:" + digest(state["scope"]),
               "worktree_fingerprint": "desktop-v1:" + key,
               "lease_owner": state["host_id"] + ":" + str(os.getpid()), "workstream": name}
    try:
        result = client.request("POST", "/workstream/runs", request)
    except ApiError as error:
        if error.status != 404:
            raise
        # A genuinely new named ledger is the only retry with changed input.
        # An ambiguous response never causes a second New request blindly.
        request.pop("workstream")
        request["new_workstream"] = name
        try:
            result = client.request("POST", "/workstream/runs", request)
        except ApiError as duplicate:
            if duplicate.status != 409:
                raise
            request.pop("new_workstream")
            request["workstream"] = name
            result = client.request("POST", "/workstream/runs", request)
    if not isinstance(result, dict) or not all(isinstance(result.get(key), str) and result[key] and len(result[key]) <= 128
               for key in ("workstream_id", "run_id")):
        raise MemoryError("Invalid managed-run preparation acknowledgement")
    state["workstream_id"] = result["workstream_id"]
    return result["run_id"]


def drain_one(config, client, session_id, deadline):
    key = digest(session_id)
    with locked(config.state_dir / "locks" / (key + ".lock")) as lease:
        state = read_json(state_path(config, session_id))
        job = read_json(job_path(config, session_id))
        if not state or not job:
            return {"session_id": session_id, "imported_events": 0, "status": "nothing_pending"}
        # The host drain lock serializes importers. Never hold the hook/state
        # lock during transcript scanning or remote requests.
        lease.release()
        config.require_scope(state["scope"])
        revision = job["revision"]
        boundary = activation(config)
        events, cursors = [], {}
        seen = set(state["seen_event_ids"])
        losses = set(state["losses"])
        deferred = False
        for path in discover_files(config, state, boundary):
            if time.monotonic() > deadline:
                raise MemoryError("Capture drain budget exhausted; pending work retained")
            file_state = state["files"][str(path)]
            if transcript.header(path)["id"] != session_id:
                raise MemoryError("Transcript identity changed; capture quarantined")
            visible, cursor, omitted = transcript.scan(path, session_id, file_state["cursor"], file_state["baseline"])
            cursors[str(path)] = cursor
            losses.update(omitted)
            deferred = deferred or "partial_tail_deferred" in omitted
            for event in visible:
                if event["event_id"] not in seen:
                    seen.add(event["event_id"])
                    events.append(event)
        # Persist recovery state before network calls. Retry the exact same run
        # and batch after an uncertain response, never invent a new identity.
        pending = read_json(config.state_dir / "pending" / (key + ".json"))
        if not pending and events:
            run_id = prepare(client, state)
            pending = {"run_id": run_id, "events": events, "cursors": cursors,
                       "seen_event_ids": sorted(seen), "losses": sorted(losses), "next_batch": 0,
                       "revision": revision, "checkpoint": checkpoint(state["anchor_cwd"])}
            save_state(config, state)
            write_json(config.state_dir / "pending" / (key + ".json"), pending)
        if pending:
            events = pending["events"]
            # Keep payloads comfortably below the10MiB server body ceiling.
            batches, batch, size = [], [], 0
            for event in events:
                event_size = len(json.dumps(event, ensure_ascii=False).encode())
                if batch and (len(batch) >= 512 or size + event_size > 4 * 1024 * 1024):
                    batches.append(batch)
                    batch, size = [], 0
                batch.append(event)
                size += event_size
            if batch:
                batches.append(batch)
            for index in range(pending["next_batch"], len(batches)):
                if time.monotonic() > deadline:
                    raise MemoryError("Capture drain budget exhausted; pending batches retained")
                complete = index == len(batches) - 1
                request = {"native_session_id": session_id, "events": batches[index], "complete": complete,
                           "checkpoint": pending["checkpoint"], "losses": pending["losses"], "exit_code": None}
                if complete:
                    request["source_cursor"] = json.dumps({"adapter": "desktop-v1", "files": pending["cursors"]}, sort_keys=True)
                try:
                    ack = client.request("POST", "/workstream/runs/" + pending["run_id"] + "/finish", request)
                    if not isinstance(ack, dict) or any(type(ack.get(key)) is not int or ack[key] < 0
                                                        for key in ("imported_events", "latest_sequence")):
                        raise MemoryError("Invalid managed-run finish acknowledgement; pending batch retained")
                except ApiError as error:
                    if error.status == 409:
                        # Lease expired or was superseded. A new short run in
                        # the same ledger replays stable IDs without duplicates.
                        pending["run_id"] = prepare(client, state)
                        pending["next_batch"] = 0
                        write_json(config.state_dir / "pending" / (key + ".json"), pending)
                    raise
                pending["next_batch"] = index + 1
                write_json(config.state_dir / "pending" / (key + ".json"), pending)
            # Registry acknowledgement is part of completion: uploaded ledgers
            # must be discoverable from another host before the queue is acked.
            if not state.get("registry_path") or state.get("registry_receipt_key_id") != config.registry_key_id:
                state["registry_path"] = register_ledger(client, state["scope"], descriptor(state))
                state["registry_receipt_key_id"] = config.registry_key_id
            for path, cursor in pending["cursors"].items():
                state["files"][path]["cursor"] = cursor
            state["seen_event_ids"] = pending["seen_event_ids"]
            state["losses"] = pending["losses"]
            state["imported_events"] += len(events)
            state["last_success_at"] = now()
            save_state(config, state)
            (config.state_dir / "pending" / (key + ".json")).unlink()
            # If this drain resumed a saved batch, newer records have not been
            # included. Leave the queue for the next pass.
            revision = pending["revision"]
        else:
            for path, cursor in cursors.items():
                state["files"][path]["cursor"] = cursor
            state["losses"] = sorted(losses)
            save_state(config, state)
        with locked(config.state_dir / "locks" / (key + ".lock")):
            current = read_json(job_path(config, session_id))
            if current and current["revision"] == revision and not deferred:
                job_path(config, session_id).unlink()
        return {"session_id": session_id, "scope": state["scope"], "imported_events": len(events),
                "status": "captured" if events else "no_new_visible_events", "losses": state["losses"]}


def drain(config, session_id=None):
    activation(config)
    with locked(config.state_dir / "drain.lock", blocking=False) as acquired:
        if not acquired:
            return {"status": "another_drain_running", "results": []}
        deadline = time.monotonic() + config.drain_budget
        client = Client(config)
        results = []
        native_drained, native_error = 0, None
        try:
            # Optional host integration is owned by the installer/router. Keep
            # the runtime usable alone, but make manual drain repair both queues.
            import native_hooks
            native_drained = native_hooks.drain(config, client=client)
        except ImportError:
            pass
        except MemoryError as error:
            native_error = str(error)
        candidates = [job_path(config, session_id)] if session_id else sorted((config.state_dir / "queue").glob("*.json"))
        for candidate in candidates:
            job = read_json(candidate)
            if not job:
                continue
            try:
                result = drain_one(config, client, job["session_id"], deadline)
            except MemoryError as error:
                result = {"session_id": job["session_id"], "status": "pending", "error": str(error)}
            results.append(result)
            if time.monotonic() >= deadline:
                break
        report = {"at": now(), "status": "pending" if any(item["status"] == "pending" for item in results) else "ok",
                  "results": results, "queued_sessions": len(list((config.state_dir / "queue").glob("*.json")))}
        report["native_hooks_drained"] = native_drained
        report["native_hooks_pending"] = len(list((config.state_dir / "native-hooks").glob("*.json")))
        if native_error:
            report.update({"status": "pending", "native_error": native_error})
        write_json(config.state_dir / "last-drain.json", report)
        return report
