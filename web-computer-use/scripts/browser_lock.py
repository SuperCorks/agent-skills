#!/usr/bin/env python3
"""Cooperative, expiring reservations for local browser and desktop use."""

import argparse
from contextlib import contextmanager
import fcntl
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import sys
import tempfile
import time
import uuid


BROWSERS = ("chrome", "comet", "brave", "safari")
PLUGIN_BROWSERS = ("chrome", "brave")
MODES = ("plugin", "computer-use")
LEASE_SECONDS = 300
MAX_WAIT_SECONDS = 600
DEFAULT_ROOT = Path.home() / ".local/state/web-computer-use/locks"
TOKEN_PATTERN = re.compile(r"[0-9a-f]{32}")
THREAD_PATTERN = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")


class LockError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def emit(value, stream=None):
    print(json.dumps(value, sort_keys=True), file=stream or sys.stdout, flush=True)


def validate_mode(browser, mode):
    if browser not in BROWSERS or mode not in MODES:
        raise LockError("invalid_request", "Unknown browser or mode.")
    if mode == "plugin" and browser not in PLUGIN_BROWSERS:
        raise LockError("invalid_request", "Plugin mode is supported only for Chrome and Brave.")


def candidates_for(browser, mode, fallbacks=(), pinned=False, profile=None):
    validate_mode(browser, mode)
    if pinned and fallbacks:
        raise LockError("invalid_request", "A pinned browser/profile cannot have fallbacks.")
    if profile is not None and browser not in PLUGIN_BROWSERS:
        raise LockError("invalid_request", "Profile metadata is supported for Chrome and Brave.")
    candidates = [{"browser": browser, "mode": mode}]
    for fallback in fallbacks:
        validate_mode(fallback, "computer-use")
        if fallback not in [item["browser"] for item in candidates]:
            candidates.append({"browser": fallback, "mode": "computer-use"})
    return candidates


def resources(lease):
    if lease["state"] != "held":
        return {}
    if lease["mode"] == "plugin":
        return {lease["browser"]: "shared"}
    return {lease["browser"]: "exclusive", "desktop": "exclusive"}


def blockers_for(candidate, leases, request):
    blockers = []
    for lease in leases:
        if lease["token"] == request["token"]:
            continue
        blocked = []
        if lease["state"] == "held":
            if candidate["browser"] == lease["browser"] and (
                candidate["mode"] == "computer-use" or lease["mode"] == "computer-use"
            ):
                blocked.append(candidate["browser"])
            if candidate["mode"] == lease["mode"] == "computer-use":
                blocked.append("desktop")
        elif (lease["queued_at"], lease["token"]) < (
            request["queued_at"], request["token"]
        ):
            # Writer priority is browser-local. An unavailable browser writer
            # must not reserve an otherwise free desktop or another browser.
            if any(item == {"browser": candidate["browser"], "mode": "computer-use"}
                   for item in lease["candidates"]):
                blocked.append(candidate["browser"] + ":queued-exclusive")
        if blocked:
            blockers.append({
                "owner": lease["owner"], "state": lease["state"],
                "browser": lease["browser"], "mode": lease["mode"],
                "resources": blocked, "expires_at": lease["expires_at"],
            })
    return blockers


class LeaseStore:
    def __init__(self, root=DEFAULT_ROOT, clock=time.time):
        self.root = Path(root).expanduser().absolute()
        self.clock = clock

    def _check_private(self, path, directory=False):
        info = path.lstat()
        expected_type = stat.S_ISDIR if directory else stat.S_ISREG
        if not expected_type(info.st_mode) or info.st_uid != os.getuid():
            raise LockError("unsafe_store", f"Not an owned, regular {'directory' if directory else 'file'}: {path}")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise LockError("unsafe_store", f"Expected private permissions on {path}")

    @contextmanager
    def guarded(self, deadline=None, read_only=False):
        if self.root.is_symlink():
            raise LockError("unsafe_store", "Reservation directory must not be a symlink.")
        if read_only and not self.root.exists():
            yield False
            return
        if not read_only:
            self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._check_private(self.root, directory=True)
        guard = self.root / ".guard.lock"
        if guard.is_symlink():
            raise LockError("unsafe_store", "Reservation metadata guard must not be a symlink.")
        if read_only and not guard.exists():
            if any(self.root.glob("*.json")):
                raise LockError("unsafe_store", "Reservation metadata guard is missing.")
            yield False
            return
        flags = os.O_RDONLY if read_only else os.O_CREAT | os.O_RDWR
        fd = os.open(guard, flags | os.O_NOFOLLOW, 0o600)
        try:
            self._check_private(guard)
            limit = deadline if deadline is not None else time.monotonic() + 5
            while True:
                try:
                    fcntl.flock(fd, (fcntl.LOCK_SH if read_only else fcntl.LOCK_EX) | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    remaining = limit - time.monotonic()
                    if remaining <= 0:
                        raise LockError("guard_busy", "Reservation metadata is busy; no browser access was granted.")
                    time.sleep(min(0.05, remaining))
            yield True
        finally:
            os.close(fd)

    def _validate(self, lease):
        if not isinstance(lease, dict) or lease.get("version") != 1:
            raise ValueError("Invalid lease version")
        if not isinstance(lease.get("token"), str) or not TOKEN_PATTERN.fullmatch(lease["token"]):
            raise ValueError("Invalid token")
        if not isinstance(lease.get("owner"), str) or not lease["owner"].strip():
            raise ValueError("Invalid owner")
        if lease.get("state") not in ("held", "pending"):
            raise ValueError("Invalid state")
        for field in ("created_at", "queued_at", "updated_at", "expires_at"):
            if not isinstance(lease.get(field), (int, float)) or not math.isfinite(lease[field]):
                raise ValueError("Invalid timestamp")
        candidates = lease.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("Invalid candidates")
        for item in candidates:
            validate_mode(item["browser"], item["mode"])
        validate_mode(lease["browser"], lease["mode"])
        if lease.get("profile") is not None and not isinstance(lease["profile"], str):
            raise ValueError("Invalid profile")
        for field in ("acquired_at", "mode_since"):
            if lease.get(field) is not None and (not isinstance(lease[field], (int, float)) or not math.isfinite(lease[field])):
                raise ValueError("Invalid acquisition timestamp")
        if lease.get("thread_id") is not None and not THREAD_PATTERN.fullmatch(str(lease["thread_id"])):
            raise ValueError("Invalid task ID")
        if lease.get("task_name") is not None and not isinstance(lease["task_name"], str):
            raise ValueError("Invalid task name")

    def load(self, prune=True):
        """Call under guarded(); malformed state fails closed, even if stale."""
        leases = {}
        expired = []
        for path in sorted(self.root.glob("*.json")):
            self._check_private(path)
            try:
                lease = json.loads(path.read_text())
                self._validate(lease)
                if path.name not in [f"{browser}.{lease['token']}.json" for browser in BROWSERS]:
                    raise ValueError("Invalid lease filename")
                if lease["token"] in leases:
                    raise ValueError("Duplicate token")
            except (ValueError, KeyError, TypeError, LockError) as exc:
                raise LockError("corrupt_store", f"Invalid reservation file: {path}; stop and inspect it without discarding other reservations.") from exc
            leases[lease["token"]] = (path, lease)
            if lease["expires_at"] <= self.clock():
                expired.append(lease["token"])
        for token in expired:
            path, _ = leases.pop(token)
            if prune:
                path.unlink()
        return leases

    def write(self, lease, old_path=None):
        # During a fallback, replace contents first, then rename the same file.
        # A crash between these steps leaves ONE valid lease. Its contents,
        # never the filename prefix, determine the reserved browser.
        destination = self.root / f"{lease['browser']}.{lease['token']}.json"
        path = old_path or destination
        fd, temporary = tempfile.mkstemp(prefix=".lease-", suffix=".tmp", dir=self.root)
        try:
            with os.fdopen(fd, "w") as output:
                json.dump(lease, output, sort_keys=True)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            if path != destination:
                os.replace(path, destination)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def owned(self, leases, token, owner, held=True):
        if token not in leases:
            raise LockError("reservation_lost", "Reservation is absent or expired; reacquire and inspect the browser before acting.")
        path, lease = leases[token]
        if lease["owner"] != owner:
            raise LockError("wrong_owner", "Reservation belongs to a different owner.")
        if held and lease["state"] != "held":
            raise LockError("not_held", "A pending reservation grants no browser access.")
        return path, lease

    def status(self):
        with self.guarded():
            records = self.load()
            return {"status": "ok", "lock_dir": str(self.root), "reservations": [
                {**lease, "resources": resources(lease),
                 "remaining_seconds": max(0, lease["expires_at"] - self.clock())}
                for _, lease in records.values()
            ]}

    def snapshot(self):
        """Read-only public status: no files created, pruned, or rewritten; no tokens."""
        with self.guarded(time.monotonic() + 0.15, read_only=True) as available:
            records = self.load(prune=False) if available else {}
            fields = ("owner", "state", "browser", "mode", "profile", "task_name", "thread_id",
                      "acquired_at", "mode_since", "queued_at", "updated_at", "expires_at", "candidates")
            return {"status": "ok", "sampled_at": self.clock(), "reservations": [
                {field: lease.get(field) for field in fields}
                for _, lease in records.values()
            ]}

    def renew(self, token, owner):
        with self.guarded():
            path, lease = self.owned(self.load(), token, owner)
            lease = {**lease, "updated_at": self.clock(), "expires_at": self.clock() + LEASE_SECONDS}
            self.write(lease, path)
            return {"status": "renewed", "lease": lease, "resources": resources(lease)}

    def release(self, token, owner, deadline=None):
        with self.guarded(deadline):
            leases = self.load()
            if token not in leases:
                return {"status": "absent", "token": token}
            path, _ = self.owned(leases, token, owner, held=False)
            path.unlink()
            return {"status": "released", "token": token}


def reserve(store, owner, candidates=None, profile=None, wait=MAX_WAIT_SECONDS,
            until=None, token=None, mode=None, progress=None, poll=2, thread_id=None, task_name=None):
    """Acquire or transition; never hold the guard while waiting on a browser."""
    if not isinstance(owner, str) or not owner.strip() or len(owner) > 200:
        raise LockError("invalid_request", "Use a nonempty owner identifier of at most 200 characters.")
    if not math.isfinite(wait) or not 0 <= wait <= MAX_WAIT_SECONDS:
        raise LockError("invalid_request", "Wait must be between 0 and 600 seconds.")
    if until is not None and not math.isfinite(until):
        raise LockError("invalid_request", "Deadline must be a finite Unix timestamp.")
    if thread_id is not None and not THREAD_PATTERN.fullmatch(thread_id):
        raise LockError("invalid_request", "Task ID must be a Codex task UUID.")
    if task_name is not None and (not isinstance(task_name, str) or not task_name.strip() or len(task_name) > 500):
        raise LockError("invalid_request", "Task name must be nonempty and at most 500 characters.")
    started = time.monotonic()
    duration = min(wait, max(0, until - store.clock())) if until is not None else wait
    deadline = started + duration
    wall_deadline = store.clock() + duration
    transition = token is not None
    token = token or uuid.uuid4().hex
    if until is not None and until <= store.clock():
        # An explicit old deadline is different from --wait 0 (try once).
        # In particular, do not consume an existing lease on this error path.
        if transition:
            raise LockError("transition_not_started", "Deadline already elapsed; the original reservation was not changed. Release it before pausing.")
        return {"status": "timeout", "owner": owner, "token": token,
                "waited_seconds": 0, "blockers": [],
                "reservation_held": False, "reason": "deadline_elapsed"}
    initialized = False
    owns_request = False
    request = None
    last_progress = -math.inf
    last_blockers = []
    successful = False
    try:
        while True:
            if initialized and time.monotonic() >= deadline:
                break
            # Small guard waits keep progress and cancellation responsive.
            try:
                with store.guarded(min(deadline, time.monotonic() + 1)):
                    if duration > 0 and time.monotonic() >= deadline:
                        break
                    leases = store.load()
                    now = store.clock()
                    # Reading/pruning can cross the deadline after the guard
                    # check. An expired pending ticket is a timeout, not lost
                    # ownership, and must never become a fresh grant here.
                    if duration > 0 and (time.monotonic() >= deadline or now >= wall_deadline):
                        break
                    if not initialized:
                        if transition:
                            path, previous = store.owned(leases, token, owner)
                            validate_mode(previous["browser"], mode)
                            candidates = [{"browser": previous["browser"], "mode": mode}]
                            request = {**previous, "candidates": candidates, "mode": mode,
                                       "queued_at": now, "updated_at": now,
                                       "expires_at": min(now + LEASE_SECONDS, wall_deadline),
                                       "state": "pending"}
                            if mode == "plugin":
                                # Downgrade keeps the existing browser reservation
                                # while releasing desktop access atomically.
                                request.update(state="held", expires_at=now + LEASE_SECONDS)
                                if previous["mode"] != mode:
                                    request["mode_since"] = now
                                store.write(request, path)
                                successful = True
                                return {"status": "acquired", "lease": request, "resources": resources(request)}
                            # Relinquish our reader before comparing queued writers.
                            leases.pop(token)
                            owns_request = True
                        else:
                            if not candidates:
                                raise LockError("invalid_request", "At least one candidate is required.")
                            for candidate in candidates:
                                validate_mode(candidate["browser"], candidate["mode"])
                            path = None
                            request = {"version": 1, "token": token, "owner": owner,
                                       "browser": candidates[0]["browser"], "mode": candidates[0]["mode"],
                                       "candidates": candidates, "profile": profile,
                                       "thread_id": thread_id, "task_name": task_name,
                                       "created_at": now, "queued_at": now, "updated_at": now,
                                       "expires_at": min(now + LEASE_SECONDS, wall_deadline), "state": "pending"}
                        initialized = True
                    else:
                        path, request = store.owned(leases, token, owner, held=False)
                        request = {**request, "updated_at": now,
                                   "expires_at": min(now + LEASE_SECONDS, wall_deadline)}

                    last_blockers = []
                    for candidate in candidates:
                        blocked = blockers_for(candidate, [item[1] for item in leases.values()], request)
                        if not blocked:
                            request.update(candidate)
                            request.update(state="held", expires_at=now + LEASE_SECONDS,
                                           acquired_at=now, mode_since=now)
                            if candidate["browser"] != candidates[0]["browser"]:
                                request["profile"] = None
                            store.write(request, path)
                            owns_request = True
                            successful = True
                            return {"status": "acquired", "lease": request, "resources": resources(request)}
                        last_blockers.append({"candidate": candidate, "blockers": blocked})
                    if time.monotonic() < deadline:
                        store.write(request, path)
                        owns_request = True
                    elif transition:
                        # An immediate failed upgrade still relinquishes its reader.
                        path.unlink()
            except LockError as exc:
                if exc.code != "guard_busy":
                    raise
                last_blockers = [{"resources": ["metadata-guard"]}]

            current = time.monotonic()
            if progress and current - last_progress >= 30:
                progress({"status": "waiting", "token": token, "owner": owner,
                          "remaining_seconds": max(0, deadline - current), "blockers": last_blockers})
                last_progress = current
            if current >= deadline:
                break
            time.sleep(min(poll, deadline - current))
        if transition and not initialized:
            raise LockError("transition_not_started", "Metadata remained busy; the original reservation was not changed. Release it before pausing.")
        return {"status": "timeout", "owner": owner, "token": token,
                "waited_seconds": time.monotonic() - started,
                "blockers": last_blockers, "reservation_held": False}
    finally:
        if owns_request and not successful:
            try:
                # Never extend the contention budget for cleanup. A pending
                # ticket also expires at the deadline if the guard is busy.
                store.release(token, owner, deadline=time.monotonic())
            except (LockError, OSError):
                pass


class JsonParser(argparse.ArgumentParser):
    def error(self, message):
        raise LockError("invalid_request", message)


def parser():
    result = JsonParser(description=__doc__)
    result.add_argument("--lock-dir", type=Path, default=DEFAULT_ROOT,
                        help="Override only for isolated tests; production callers must share the default.")
    commands = result.add_subparsers(dest="command", required=True)
    acquire = commands.add_parser("acquire", help="Reserve a browser, optionally trying ordered fallbacks.")
    acquire.add_argument("--browser", choices=BROWSERS, required=True)
    acquire.add_argument("--mode", choices=MODES, required=True)
    acquire.add_argument("--fallback", choices=BROWSERS, nargs="*", default=[])
    acquire.add_argument("--pinned", action="store_true", help="Reject fallbacks for an explicit browser/profile choice.")
    acquire.add_argument("--profile", help="Verified or intended Chrome/Brave display name; this never selects a profile.")
    acquire.add_argument("--thread-id", default=os.environ.get("CODEX_THREAD_ID") or None,
                         help="Codex task UUID; defaults to CODEX_THREAD_ID when available.")
    acquire.add_argument("--task-name", help="Current task title, used by the read-only status extension.")
    for name in ("renew", "release", "transition"):
        command = commands.add_parser(name)
        command.add_argument("--token", required=True)
        command.add_argument("--owner", required=True)
        if name == "transition":
            command.add_argument("--mode", choices=MODES, required=True)
    acquire.add_argument("--owner", required=True)
    for command in (acquire, commands.choices["transition"]):
        command.add_argument("--wait", type=float, default=MAX_WAIT_SECONDS, help="0–600 seconds; 0 tries once.")
        command.add_argument("--until", type=float, help="Original absolute Unix deadline when continuing the same acquisition episode.")
    commands.add_parser("status")
    commands.add_parser("snapshot", help="Read-only, token-free status for the companion extension.")
    return result


def main(argv=None):
    try:
        args = parser().parse_args(argv)
        store = LeaseStore(args.lock_dir)
        if args.command in ("status", "snapshot"):
            result = getattr(store, args.command)()
        elif args.command in ("renew", "release"):
            result = getattr(store, args.command)(args.token, args.owner)
        else:
            options = {"wait": args.wait, "until": args.until,
                       "progress": lambda value: emit(value, sys.stderr)}
            if args.command == "transition":
                options.update(token=args.token, mode=args.mode)
            else:
                options.update(candidates=candidates_for(args.browser, args.mode, args.fallback, args.pinned, args.profile),
                               profile=args.profile, thread_id=args.thread_id, task_name=args.task_name)
            result = reserve(store, args.owner, **options)
        emit(result)
        return 1 if result["status"] == "timeout" else 0
    except LockError as exc:
        emit({"status": "error", "code": exc.code, "message": str(exc)})
        return 2
    except OSError as exc:
        emit({"status": "error", "code": "io_error", "message": str(exc)})
        return 2
    except KeyboardInterrupt:
        emit({"status": "cancelled", "message": "Reservation wait cancelled; no browser access is granted."})
        return 130


def interrupt_wait(*_):
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupt_wait)
    sys.exit(main())
