#!/usr/bin/env python3
"""agent-conductor: token-cheap shared state store for a master agent and its workers.

The master agent plans work and dispatches sub-agent workers. Workers never read
the master's transcript and the master never reads worker transcripts; everything
flows through the files this script owns.

State lives under $AGENT_CONDUCTOR_HOME (default ~/.agent-conductor):

    <root>/runs/<run-id>/run.json        run metadata
    <root>/runs/<run-id>/plan.md         master-owned plan
    <root>/runs/<run-id>/tasks.json      authoritative task registry
    <root>/runs/<run-id>/tasks/*.md      handoff packets and worker reports
    <root>/runs/<run-id>/briefs/*.md     explorer briefs
    <root>/runs/<run-id>/events.jsonl    machine-readable event stream
    <root>/runs/<run-id>/events.log      greppable/tailable mirror
    <root>/worktrees/<run-id>/<id>-<slug>  git worktrees created by this script
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

ROLES = ("implement", "review", "explore", "monitor", "computer-use", "integrate")
TASK_STATUSES = (
    "pending",
    "assigned",
    "running",
    "blocked",
    "done",
    "failed",
    "accepted",
    "rejected",
)
RUN_STATUSES = ("planning", "running", "verifying", "done", "aborted")
EVENT_KINDS = (
    "started",
    "progress",
    "blocked",
    "done",
    "failed",
    "accepted",
    "rejected",
    "note",
    "heartbeat",
)
COMMIT_POLICIES = ("none", "commit", "commit-and-push")
HARNESSES = ("claude", "codex", "other")
DEFAULT_WATCH_KINDS = ("blocked", "done", "failed", "accepted", "rejected")
DEFAULT_MAX_WORKERS = 3
TERMINAL_RUN_STATUSES = ("done", "aborted")
EVENT_LINE_RE = re.compile(r"^(?P<ts>\S+) \[(?P<where>[^\]]*)\] (?P<kind>[A-Z0-9_-]+): (?P<message>.*)$")


class ConductorError(Exception):
    """An expected user-facing error (no traceback, exit code 1)."""


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def collapse(text: str) -> str:
    return " ".join(str(text).split())


def truncate(text: str, limit: int) -> str:
    text = collapse(text)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def slugify(text: str, max_length: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    if len(slug) > max_length:
        slug = slug[:max_length].strip("-")
    return slug or "task"


def humanize(seconds: Optional[float]) -> str:
    if seconds is None:
        return "-"
    seconds = int(max(0, seconds))
    if seconds < 60:
        return f"{seconds}s"
    minutes, sec = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m{sec:02d}s"
    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        return f"{hours}h{minutes:02d}m"
    days, hours = divmod(hours, 24)
    return f"{days}d{hours:02d}h"


def age_of(iso: Optional[str]) -> str:
    stamp = parse_iso(iso)
    if stamp is None:
        return "-"
    return humanize((datetime.now(timezone.utc) - stamp).total_seconds())


# --------------------------------------------------------------------------
# paths and io
# --------------------------------------------------------------------------


def script_path() -> Path:
    return Path(os.path.realpath(__file__))


def state_root() -> Path:
    env = os.environ.get("AGENT_CONDUCTOR_HOME")
    if env:
        return Path(env).expanduser().absolute()
    return Path.home() / ".agent-conductor"


def runs_root() -> Path:
    return state_root() / "runs"


def worktrees_root() -> Path:
    return state_root() / "worktrees"


def run_dir(run_id: str) -> Path:
    return runs_root() / run_id


def load_json(path: Path) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        raise ConductorError(f"missing file: {path}")
    except json.JSONDecodeError as exc:
        raise ConductorError(f"corrupt JSON in {path}: {exc}")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


@contextlib.contextmanager
def run_lock(directory: Path) -> Iterator[None]:
    """Advisory lock around registry mutations."""
    directory.mkdir(parents=True, exist_ok=True)
    lock_path = directory / ".lock"
    with open(lock_path, "a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


# --------------------------------------------------------------------------
# run resolution
# --------------------------------------------------------------------------


def repo_root(cwd: Path) -> Path:
    cwd = Path(cwd).expanduser()
    if not cwd.is_dir():
        raise ConductorError(f"not a directory: {cwd}")
    cwd = cwd.resolve()
    if shutil.which("git"):
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            return Path(result.stdout.strip()).resolve()
    return cwd


def all_runs() -> list[dict[str, Any]]:
    root = runs_root()
    if not root.is_dir():
        return []
    runs = []
    for entry in sorted(root.iterdir()):
        meta = entry / "run.json"
        if not meta.is_file():
            continue
        try:
            with open(meta, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        data.setdefault("id", entry.name)
        runs.append(data)
    return runs


def find_latest_run_id(cwd: Path) -> Optional[str]:
    target = str(repo_root(cwd))
    matches = [r for r in all_runs() if str(Path(str(r.get("cwd", ""))).absolute()) == target]
    if not matches:
        return None
    matches.sort(key=lambda r: (str(r.get("created", "")), str(r.get("id", ""))))
    return str(matches[-1]["id"])


def resolve_run(args: argparse.Namespace) -> tuple[str, Path, dict[str, Any]]:
    run_id = getattr(args, "run", None)
    if run_id:
        directory = run_dir(run_id)
        if not (directory / "run.json").is_file():
            raise ConductorError(f"unknown run '{run_id}' (expected {directory / 'run.json'})")
    else:
        cwd = Path(getattr(args, "cwd", None) or ".")
        found = find_latest_run_id(cwd)
        if not found:
            raise ConductorError(
                f"no conductor run found for {repo_root(cwd)}; run `conductor.py init` first"
            )
        run_id = found
        directory = run_dir(run_id)
        print(f"conductor: using run {run_id}", file=sys.stderr)
    return run_id, directory, load_json(directory / "run.json")


def load_registry(directory: Path) -> dict[str, Any]:
    registry = load_json(directory / "tasks.json")
    if not isinstance(registry, dict) or not isinstance(registry.get("tasks"), list):
        raise ConductorError(f"malformed registry: {directory / 'tasks.json'}")
    return registry


def save_registry(directory: Path, registry: dict[str, Any]) -> None:
    known = {t["id"] for t in registry["tasks"]}
    for task in registry["tasks"]:
        for dep in task.get("depends_on", []):
            if dep not in known:
                raise ConductorError(f"task {task['id']} depends on unknown task '{dep}'")
    write_json(directory / "tasks.json", registry)


def find_task(registry: dict[str, Any], task_id: str) -> dict[str, Any]:
    for task in registry["tasks"]:
        if task["id"] == task_id:
            return task
    known = ", ".join(t["id"] for t in registry["tasks"]) or "(none)"
    raise ConductorError(f"unknown task '{task_id}'; known task ids: {known}")


# --------------------------------------------------------------------------
# events
# --------------------------------------------------------------------------


def actor(args: argparse.Namespace) -> str:
    return (
        getattr(args, "by", None)
        or os.environ.get("AGENT_CONDUCTOR_ACTOR")
        or "unknown"
    )


def append_event(
    directory: Path,
    kind: str,
    message: str,
    by: str,
    task: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    ts = now_iso()
    record = {
        "ts": ts,
        "task": task["id"] if task else None,
        "kind": kind,
        "message": collapse(message),
        "by": by,
    }
    with open(directory / "events.jsonl", "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")
        handle.flush()
    where = f"{task['id']} {task.get('role', '?')}" if task else "run"
    with open(directory / "events.log", "a", encoding="utf-8") as handle:
        handle.write(f"{ts} [{where}] {kind.upper()}: {collapse(message)}\n")
        handle.flush()
    return record


def read_events(directory: Path) -> list[dict[str, Any]]:
    path = directory / "events.jsonl"
    if not path.is_file():
        return []
    events = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def last_event_times(directory: Path) -> dict[Optional[str], str]:
    stamps: dict[Optional[str], str] = {}
    for event in read_events(directory):
        stamps[event.get("task")] = event.get("ts", "")
    return stamps


# --------------------------------------------------------------------------
# templates
# --------------------------------------------------------------------------


PLAN_TEMPLATE = """# Plan: {goal}

## Goal
{goal}

## Definition of done
- (master: fill in the observable, verifiable end state)

## Constraints
- (master: fill in: files or areas off limits, conventions, budgets, tools)

## Approach
(master: fill in the sequencing and why it is safe to parallelise)

## Tasks
The task registry in `tasks.json` is authoritative; handoff packets live in `tasks/`.
Use `conductor.py status` for the live view. Keep prose here about intent only.

## Decisions log
- {created} run created
"""


def render_packet(
    *,
    run: dict[str, Any],
    directory: Path,
    task: dict[str, Any],
    objective: Optional[str],
    files: Optional[str],
    acceptance: list[str],
    verify: list[str],
) -> str:
    run_id = run["id"]
    depends = ", ".join(task["depends_on"]) if task["depends_on"] else "none"
    workdir = task["worktree"] or run["cwd"]
    plan = str(directory / "plan.md")
    script = str(script_path())
    task_id = task["id"]
    policy = task["commit_policy"]

    objective_text = objective.strip() if objective and objective.strip() else "(master: fill in)"
    if files and files.strip():
        scope = ", ".join(part.strip() for part in files.split(",") if part.strip())
    else:
        scope = "(master: fill in)"
    criteria = acceptance or ["(master: fill in)"]
    criteria_block = "\n".join(f"- [ ] {item}" for item in criteria)
    checks = verify or ["(master: fill in the project's lint/test/build commands)"]
    verify_block = "\n".join(f"- {item}" for item in checks)

    return f"""# Task {task_id}: {task['title']}

Run: {run_id}
Role: {task['role']}
Depends on: {depends}
Plan: {plan} (read Goal, Definition of done, and Constraints first)
Working directory: {workdir}
Commit policy: {policy} (none = do not commit; commit = commit on the current branch when acceptance criteria pass; commit-and-push = also push)
Conductor script: {script}
Run id: {run_id}

## Objective
{objective_text}

## Scope
Files or areas you own: {scope}
Do not edit anything outside this scope. Preserve unrelated changes.

## Acceptance criteria
{criteria_block}

## Constraints
- Follow the repository's AGENTS.md / CLAUDE.md and existing conventions.
- Do not create git worktrees, background processes, or sub-agents of your own unless this packet says so.
- Never switch to fast mode. Do not change models or reasoning settings.
- If the packet and the code disagree in a way that changes the plan, report `blocked` instead of improvising.

## Verification
Run before reporting done:
{verify_block}

## Protocol
1. First: `python3 {script} event --run {run_id} --task {task_id} --kind started --message "<one line on your approach>"`
2. On each milestone (at most every ~10 minutes): `... --kind progress --message "<what is done>"`
3. If you cannot proceed: `... --kind blocked --message "<exactly what you need>"`, then write the report and stop.
4. When all acceptance criteria pass: write the report (below), then `... --kind done --message "<one-line result>"`.
5. If you must give up: write the report, then `... --kind failed --message "<why>"`.
Do not run any other conductor subcommand; do not edit plan.md, tasks.json, or other tasks' files.

## Report
Write {task['report']} with exactly these sections:
## Summary
## Files changed
## Commands run and results
## Acceptance criteria
(copy the checklist above and tick each criterion you verified: `- [x]`)
## Deviations from the packet
## Open questions and follow-ups
"""


# --------------------------------------------------------------------------
# output helpers
# --------------------------------------------------------------------------


def emit(args: argparse.Namespace, payload: dict[str, Any], lines: list[str]) -> None:
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2))
    else:
        for line in lines:
            print(line)


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_init(args: argparse.Namespace) -> int:
    root = repo_root(Path(args.cwd))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base = f"{slugify(root.name)}-{stamp}"
    run_id = base
    suffix = 2
    while run_dir(run_id).exists():
        run_id = f"{base}-{suffix}"
        suffix += 1

    directory = run_dir(run_id)
    (directory / "tasks").mkdir(parents=True, exist_ok=True)
    (directory / "briefs").mkdir(parents=True, exist_ok=True)
    created = now_iso()
    run = {
        "id": run_id,
        "created": created,
        "cwd": str(root),
        "harness": args.harness,
        "goal": args.goal,
        "status": "planning",
        "max_workers": args.max_workers,
        "finished": None,
        "summary": None,
    }
    with run_lock(directory):
        write_json(directory / "run.json", run)
        write_json(directory / "tasks.json", {"tasks": []})
        write_text(directory / "plan.md", PLAN_TEMPLATE.format(goal=args.goal, created=created))
        for name in ("events.jsonl", "events.log"):
            path = directory / name
            if not path.exists():
                path.touch()
        append_event(directory, "created", f"run created for goal: {args.goal}", actor(args))

    payload = {
        "run_id": run_id,
        "run_dir": str(directory),
        "plan": str(directory / "plan.md"),
        "tasks_json": str(directory / "tasks.json"),
        "events_log": str(directory / "events.log"),
        "events_jsonl": str(directory / "events.jsonl"),
        "script": str(script_path()),
        "cwd": str(root),
    }
    emit(
        args,
        payload,
        [
            f"run id:     {run_id}",
            f"run dir:    {directory}",
            f"plan:       {payload['plan']}",
            f"tasks.json: {payload['tasks_json']}",
            f"script:     {payload['script']}",
        ],
    )
    return 0


def cmd_latest(args: argparse.Namespace) -> int:
    cwd = Path(args.cwd or ".")
    run_id = find_latest_run_id(cwd)
    if not run_id:
        raise ConductorError(f"no conductor run found for {repo_root(cwd)}")
    directory = run_dir(run_id)
    emit(
        args,
        {"run_id": run_id, "run_dir": str(directory)},
        [run_id],
    )
    return 0


def cmd_task_add(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    objective = args.objective
    if args.objective_file:
        path = Path(args.objective_file).expanduser()
        if not path.is_file():
            raise ConductorError(f"objective file not found: {path}")
        objective = path.read_text(encoding="utf-8")

    depends = [part.strip() for part in (args.depends_on or "").split(",") if part.strip()]

    with run_lock(directory):
        registry = load_registry(directory)
        known = {t["id"] for t in registry["tasks"]}
        for dep in depends:
            if dep not in known:
                raise ConductorError(
                    f"--depends-on refers to unknown task '{dep}'; known: "
                    + (", ".join(sorted(known)) or "(none)")
                )
        next_id = 1
        for task in registry["tasks"]:
            try:
                next_id = max(next_id, int(task["id"]) + 1)
            except (TypeError, ValueError):
                continue
        task_id = f"{next_id:02d}"
        slug = slugify(args.title, 40)
        packet = directory / "tasks" / f"{task_id}-{slug}.md"
        report = directory / "tasks" / f"{task_id}-{slug}.report.md"

        worktree = str(Path(args.worktree).expanduser().absolute()) if args.worktree else None
        task = {
            "id": task_id,
            "slug": slug,
            "title": args.title,
            "role": args.role,
            "status": "pending",
            "depends_on": depends,
            "agent": None,
            "worktree": worktree,
            "packet": str(packet),
            "report": str(report),
            "commit_policy": args.commit_policy,
            "attempts": 0,
            "started": None,
            "finished": None,
            "last_event": None,
        }
        body = render_packet(
            run=run,
            directory=directory,
            task=task,
            objective=objective,
            files=args.files,
            acceptance=list(args.acceptance or []),
            verify=list(args.verify or []),
        )
        write_text(packet, body)
        registry["tasks"].append(task)
        save_registry(directory, registry)
        append_event(directory, "task_added", f"{task_id} {args.role}: {args.title}", actor(args), task)

    emit(
        args,
        {"run_id": run_id, "task": task},
        [f"task id: {task_id}", f"packet:  {packet}", f"report:  {report}"],
    )
    return 0


def sync_packet_header(task: dict[str, Any], run: dict[str, Any]) -> None:
    """Rewrite the packet's Working directory and Commit policy lines from the registry."""
    packet = Path(task["packet"])
    if not packet.is_file():
        return
    workdir = task.get("worktree") or run["cwd"]
    lines = packet.read_text(encoding="utf-8").split("\n")
    for index, line in enumerate(lines):
        if line.startswith("Working directory: "):
            lines[index] = f"Working directory: {workdir}"
        elif line.startswith("Commit policy: "):
            rest = line.split(" (", 1)
            suffix = f" ({rest[1]}" if len(rest) == 2 else ""
            lines[index] = f"Commit policy: {task['commit_policy']}{suffix}"
    write_text(packet, "\n".join(lines))


def cmd_task_set(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    if args.status and args.status not in TASK_STATUSES:
        raise ConductorError(
            f"invalid status '{args.status}'; expected one of: {', '.join(TASK_STATUSES)}"
        )
    if args.commit_policy and args.commit_policy not in COMMIT_POLICIES:
        raise ConductorError(
            f"invalid commit policy '{args.commit_policy}'; expected one of: {', '.join(COMMIT_POLICIES)}"
        )
    if not any([args.status, args.agent, args.worktree, args.commit_policy]):
        raise ConductorError("nothing to set: pass --status, --agent, --worktree or --commit-policy")

    with run_lock(directory):
        registry = load_registry(directory)
        task = find_task(registry, args.task)
        changes = []
        if args.status:
            changes.append(f"status {task['status']} -> {args.status}")
            task["status"] = args.status
        if args.agent:
            changes.append(f"agent {task['agent'] or 'none'} -> {args.agent}")
            task["agent"] = args.agent
        if args.worktree:
            new_worktree = str(Path(args.worktree).expanduser().absolute())
            changes.append(f"worktree {task['worktree'] or 'none'} -> {new_worktree}")
            task["worktree"] = new_worktree
        if args.commit_policy:
            changes.append(f"commit_policy {task['commit_policy']} -> {args.commit_policy}")
            task["commit_policy"] = args.commit_policy
        message = "; ".join(changes)
        save_registry(directory, registry)
        if args.worktree or args.commit_policy:
            sync_packet_header(task, _run)
        append_event(directory, "task_updated", message, actor(args), task)

    emit(
        args,
        {"run_id": run_id, "task": task, "changes": changes},
        [f"task {task['id']}: {message}"],
    )
    return 0


def cmd_task_show(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    registry = load_registry(directory)
    task = find_task(registry, args.task)
    packet = Path(task["packet"])
    content = packet.read_text(encoding="utf-8") if packet.is_file() else ""
    if not content:
        raise ConductorError(f"packet not found: {packet}")
    emit(
        args,
        {"run_id": run_id, "task": task, "packet": task["packet"], "report": task["report"], "content": content},
        [f"packet: {task['packet']}", f"report: {task['report']}", "", content.rstrip("\n")],
    )
    return 0


def cmd_task_list(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    registry = load_registry(directory)
    lines = [
        f"{t['id']}  {t['role']:<12} {t['status']:<9} {truncate(t['title'], 50)}"
        for t in registry["tasks"]
    ] or ["(no tasks)"]
    emit(args, {"run_id": run_id, "tasks": registry["tasks"]}, lines)
    return 0


def apply_event_side_effects(task: dict[str, Any], kind: str, message: str) -> None:
    task["last_event"] = f"{kind}: {collapse(message)}"
    if kind == "started":
        if task["status"] in ("pending", "assigned", "rejected", "failed"):
            task["attempts"] = int(task.get("attempts") or 0) + 1
        task["status"] = "running"
        task["started"] = now_iso()
        task["finished"] = None
    elif kind == "blocked":
        task["status"] = "blocked"
    elif kind == "done":
        task["status"] = "done"
        task["finished"] = now_iso()
    elif kind == "failed":
        task["status"] = "failed"
        task["finished"] = now_iso()
    elif kind == "accepted":
        task["status"] = "accepted"
    elif kind == "rejected":
        task["status"] = "rejected"


def cmd_event(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    if args.kind not in EVENT_KINDS:
        raise ConductorError(
            f"invalid kind '{args.kind}'; expected one of: {', '.join(EVENT_KINDS)}"
        )
    by = actor(args)
    with run_lock(directory):
        task = None
        if args.task:
            registry = load_registry(directory)
            task = find_task(registry, args.task)
            apply_event_side_effects(task, args.kind, args.message)
            save_registry(directory, registry)
            if args.kind == "started" and _run.get("status") == "planning":
                _run["status"] = "running"
                write_json(directory / "run.json", _run)
        record = append_event(directory, args.kind, args.message, by, task)

    emit(
        args,
        {"run_id": run_id, "event": record, "task": task},
        [f"recorded {args.kind} for {args.task or 'run'}"
         + (f" (status now {task['status']})" if task else "")],
    )
    return 0


def build_status(directory: Path, run: dict[str, Any]) -> dict[str, Any]:
    registry = load_registry(directory)
    tasks = registry["tasks"]
    stamps = last_event_times(directory)
    by_id = {t["id"]: t for t in tasks}

    counts: dict[str, int] = {}
    for task in tasks:
        counts[task["status"]] = counts.get(task["status"], 0) + 1

    rows = []
    for task in tasks:
        rows.append(
            {
                **task,
                "last_event_ts": stamps.get(task["id"]),
                "last_event_age": age_of(stamps.get(task["id"])),
            }
        )

    ready = [
        t["id"]
        for t in tasks
        if t["status"] == "pending"
        and all(by_id.get(dep, {}).get("status") in ("accepted", "done") for dep in t["depends_on"])
    ]
    blocked = [
        {"id": t["id"], "last_event": t.get("last_event")} for t in tasks if t["status"] == "blocked"
    ]
    awaiting = [t["id"] for t in tasks if t["status"] == "done"]
    running = [t["id"] for t in tasks if t["status"] == "running"]

    created = parse_iso(run.get("created"))
    elapsed = (datetime.now(timezone.utc) - created).total_seconds() if created else None
    return {
        "run": run,
        "elapsed": humanize(elapsed),
        "tasks": rows,
        "counts": counts,
        "ready_to_dispatch": ready,
        "open_blockers": blocked,
        "awaiting_review": awaiting,
        "running": running,
        "max_workers": run.get("max_workers", DEFAULT_MAX_WORKERS),
    }


def cmd_status(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    data = build_status(directory, run)
    if getattr(args, "json", False):
        print(json.dumps(data, indent=2))
        return 0

    lines = [
        f"run {run_id}  [{run['status']}]  elapsed {data['elapsed']}  max_workers {data['max_workers']}",
        f"goal: {truncate(run.get('goal') or '', 100)}",
        "",
    ]
    rows = data["tasks"]
    if not rows:
        lines.append("(no tasks yet)")
    else:
        header = f"{'ID':<3} {'ROLE':<12} {'STATUS':<9} {'AGENT':<14} {'ATT':<3} {'AGE':<7} LAST EVENT"
        lines.append(header)
        shown = rows[:25]
        for task in shown:
            lines.append(
                f"{task['id']:<3} {task['role']:<12} {task['status']:<9} "
                f"{truncate(task['agent'] or '-', 14):<14} {task['attempts']:<3} "
                f"{task['last_event_age']:<7} {truncate(task['last_event'] or '-', 60)}"
            )
        if len(rows) > len(shown):
            lines.append(f"... {len(rows) - len(shown)} more tasks (use --json)")
    lines.append("")
    counts = ", ".join(f"{k}={v}" for k, v in sorted(data["counts"].items())) or "none"
    lines.append(f"counts: {counts}")
    if data["open_blockers"]:
        lines.append("Open blockers:")
        for item in data["open_blockers"]:
            lines.append(f"  {item['id']}: {truncate(item['last_event'] or '(no message)', 80)}")
    else:
        lines.append("Open blockers: none")
    lines.append("Ready to dispatch: " + (", ".join(data["ready_to_dispatch"]) or "none"))
    lines.append("Awaiting review: " + (", ".join(data["awaiting_review"]) or "none"))
    lines.append(f"Running: {len(data['running'])}/{data['max_workers']}")
    for line in lines:
        print(line)
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    log_path = directory / "events.log"
    run_path = directory / "run.json"
    if not log_path.is_file():
        log_path.touch()
    kinds = None
    if not args.all:
        kinds = {
            part.strip().lower()
            for part in (args.kinds or ",".join(DEFAULT_WATCH_KINDS)).split(",")
            if part.strip()
        }
    poll = max(0.05, float(args.poll_seconds))
    print(
        f"conductor: watching {log_path} (kinds={'all' if kinds is None else ','.join(sorted(kinds))},"
        f" until={args.until})",
        file=sys.stderr,
    )

    def run_status() -> str:
        try:
            with open(run_path, "r", encoding="utf-8") as handle:
                return str(json.load(handle).get("status", ""))
        except (OSError, json.JSONDecodeError):
            return ""

    def idle() -> bool:
        try:
            with open(directory / "tasks.json", "r", encoding="utf-8") as handle:
                tasks = json.load(handle).get("tasks", [])
        except (OSError, json.JSONDecodeError):
            return False
        return not any(t.get("status") in ("running", "assigned") for t in tasks)

    try:
        with open(log_path, "r", encoding="utf-8") as handle:
            if not args.from_start:
                handle.seek(0, os.SEEK_END)
            while True:
                progressed = False
                while True:
                    position = handle.tell()
                    line = handle.readline()
                    if not line or not line.endswith("\n"):
                        handle.seek(position)
                        break
                    progressed = True
                    line = line.rstrip("\n")
                    match = EVENT_LINE_RE.match(line)
                    kind = match.group("kind").lower() if match else ""
                    if kinds is not None and kind not in kinds:
                        continue
                    print(line, flush=True)
                    if args.until == "idle" and idle():
                        return 0
                status = run_status()
                if status in TERMINAL_RUN_STATUSES:
                    print(f"RUN {status}", flush=True)
                    return 0
                if not progressed:
                    time.sleep(poll)
    except KeyboardInterrupt:
        return 0


def report_acceptance_problems(task: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    report = Path(task["report"])
    if not report.is_file():
        return [f"task {task['id']} is {task['status']} but report is missing: {report}"]
    text = report.read_text(encoding="utf-8")
    if not text.strip():
        return [f"task {task['id']} report is empty: {report}"]
    lines = text.splitlines()
    section: list[str] = []
    inside = False
    for line in lines:
        if line.strip().lower().startswith("## acceptance criteria"):
            inside = True
            continue
        if inside and line.startswith("## "):
            break
        if inside:
            section.append(line)
    if not inside:
        return [f"task {task['id']} report has no '## Acceptance criteria' section: {report}"]
    unticked = [line.strip() for line in section if re.match(r"^\s*- \[ \]", line)]
    if unticked:
        joined = "; ".join(truncate(item, 60) for item in unticked)
        problems.append(f"task {task['id']} has unticked acceptance criteria: {joined}")
    return problems


def cmd_check(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    registry = load_registry(directory)
    tasks = registry["tasks"]
    by_id = {t["id"]: t for t in tasks}
    failures: list[str] = []
    warnings: list[str] = []

    if not tasks:
        warnings.append("run has no tasks")

    for task in tasks:
        status = task["status"]
        if status in ("done", "accepted"):
            failures.extend(report_acceptance_problems(task))
        if status in ("blocked", "failed", "rejected"):
            failures.append(f"task {task['id']} is {status}: {truncate(task.get('last_event') or '-', 80)}")
        elif status in ("running", "assigned", "pending"):
            failures.append(f"task {task['id']} is {status} (not finished)")

        for dep in task["depends_on"]:
            parent = by_id.get(dep)
            if parent is None:
                failures.append(f"task {task['id']} depends on unknown task '{dep}'")
                continue
            if parent["status"] != "accepted":
                warnings.append(
                    f"task {task['id']} depends on {dep} which is {parent['status']}, not accepted"
                )
                continue
            started = parse_iso(task.get("started"))
            parent_done = parse_iso(parent.get("finished"))
            if started and parent_done and parent_done > started:
                warnings.append(
                    f"task {task['id']} started before dependency {dep} finished"
                )

        worktree = task.get("worktree")
        if worktree and Path(worktree).exists():
            warnings.append(f"task {task['id']} worktree not cleaned up: {worktree}")

    ok = not failures
    if getattr(args, "json", False):
        print(
            json.dumps(
                {
                    "run_id": run_id,
                    "ok": ok,
                    "failures": failures,
                    "warnings": warnings,
                    "result": "CHECK PASS" if ok else "CHECK FAIL",
                },
                indent=2,
            )
        )
        return 0 if ok else 1

    print(f"check {run_id} ({run['status']}), {len(tasks)} task(s)")
    for item in warnings:
        print(f"WARN {item}")
    for item in failures:
        print(f"FAIL {item}")
    print("CHECK PASS" if ok else "CHECK FAIL")
    return 0 if ok else 1


def cmd_finish(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    with run_lock(directory):
        run = load_json(directory / "run.json")
        run["status"] = args.status
        run["finished"] = now_iso()
        run["summary"] = args.summary
        write_json(directory / "run.json", run)
        append_event(
            directory,
            "finished",
            f"run {args.status}" + (f": {args.summary}" if args.summary else ""),
            actor(args),
        )
    emit(
        args,
        {"run_id": run_id, "run": run},
        [f"run {run_id} {args.status}" + (f": {args.summary}" if args.summary else "")],
    )
    return 0


def git(command: list[str], cwd: Path) -> subprocess.CompletedProcess:
    if not shutil.which("git"):
        raise ConductorError("git is not installed or not on PATH")
    try:
        return subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise ConductorError(f"git command failed: {' '.join(command)}\n{detail}")


def cmd_worktree_add(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    with run_lock(directory):
        registry = load_registry(directory)
        task = find_task(registry, args.task)
        if task.get("worktree") and Path(task["worktree"]).exists():
            raise ConductorError(
                f"task {task['id']} already has a worktree at {task['worktree']}"
            )
        name = f"{task['id']}-{task['slug']}"
        path = worktrees_root() / run_id / name
        branch = f"agent-conductor/{run_id}/{name}"
        path.parent.mkdir(parents=True, exist_ok=True)
        base = args.base or "HEAD"
        git(["git", "worktree", "add", "-b", branch, str(path), base], Path(run["cwd"]))
        task["worktree"] = str(path)
        save_registry(directory, registry)
        sync_packet_header(task, run)
        append_event(directory, "worktree_added", f"{path} on branch {branch}", actor(args), task)

    emit(
        args,
        {"run_id": run_id, "task": task["id"], "worktree": str(path), "branch": branch},
        [f"worktree: {path}", f"branch:   {branch}"],
    )
    return 0


def cmd_worktree_remove(args: argparse.Namespace) -> int:
    run_id, directory, run = resolve_run(args)
    with run_lock(directory):
        registry = load_registry(directory)
        task = find_task(registry, args.task)
        path = task.get("worktree")
        if not path:
            raise ConductorError(f"task {task['id']} has no recorded worktree")
        name = f"{task['id']}-{task['slug']}"
        branch = f"agent-conductor/{run_id}/{name}"
        git(["git", "worktree", "remove", "--force", str(path)], Path(run["cwd"]))
        if args.delete_branch:
            git(["git", "branch", "-D", branch], Path(run["cwd"]))
        task["worktree"] = None
        save_registry(directory, registry)
        sync_packet_header(task, run)
        append_event(
            directory,
            "worktree_removed",
            f"{path}" + (f" and branch {branch}" if args.delete_branch else ""),
            actor(args),
            task,
        )

    emit(
        args,
        {"run_id": run_id, "task": task["id"], "removed": path, "branch_deleted": bool(args.delete_branch)},
        [f"removed worktree: {path}"
         + (f" (branch {branch} deleted)" if args.delete_branch else "")],
    )
    return 0


def cmd_worktree_list(args: argparse.Namespace) -> int:
    run_id, directory, _run = resolve_run(args)
    registry = load_registry(directory)
    entries = [
        {"task": t["id"], "worktree": t["worktree"], "exists": Path(t["worktree"]).exists()}
        for t in registry["tasks"]
        if t.get("worktree")
    ]
    lines = [
        f"{e['task']}  {'present' if e['exists'] else 'missing'}  {e['worktree']}" for e in entries
    ] or ["(no worktrees)"]
    emit(args, {"run_id": run_id, "worktrees": entries}, lines)
    return 0


# --------------------------------------------------------------------------
# parser
# --------------------------------------------------------------------------


def add_common(parser: argparse.ArgumentParser, with_run: bool = True) -> None:
    if with_run:
        parser.add_argument("--run", help="run id (default: latest run for --cwd)")
        parser.add_argument("--cwd", default=".", help="repo path used to resolve the latest run")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="conductor.py",
        description=(
            "Shared state store between a master agent and its sub-agent workers: "
            "runs, plan, task packets, events, status, worktrees."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "State root: $AGENT_CONDUCTOR_HOME (default ~/.agent-conductor).\n"
            "Every command except `init` and `latest` accepts --run; without it the\n"
            "latest run for --cwd is used and reported on stderr."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")

    p_init = sub.add_parser("init", help="create a new run (run dir, plan.md, tasks.json)")
    p_init.add_argument("--cwd", default=".", help="repo path the run belongs to")
    p_init.add_argument("--goal", required=True, help="one-line goal for the run")
    p_init.add_argument("--harness", choices=HARNESSES, default="claude", help="master harness")
    p_init.add_argument(
        "--max-workers", type=int, default=DEFAULT_MAX_WORKERS, help="max concurrent workers"
    )
    add_common(p_init, with_run=False)
    p_init.set_defaults(func=cmd_init)

    p_latest = sub.add_parser("latest", help="print the most recent run id for a repo")
    p_latest.add_argument("--cwd", default=".", help="repo path")
    add_common(p_latest, with_run=False)
    p_latest.set_defaults(func=cmd_latest)

    p_task = sub.add_parser("task", help="manage tasks and handoff packets")
    task_sub = p_task.add_subparsers(dest="task_command", required=True, metavar="<subcommand>")

    p_add = task_sub.add_parser("add", help="add a task and render its handoff packet")
    p_add.add_argument("--title", required=True, help="short task title")
    p_add.add_argument("--role", required=True, choices=ROLES, help="worker role")
    p_add.add_argument("--depends-on", help="comma-separated task ids, e.g. 01,02")
    p_add.add_argument("--files", help="comma-separated files or areas the worker owns")
    p_add.add_argument(
        "--acceptance", action="append", default=[], help="acceptance criterion (repeatable)"
    )
    p_add.add_argument("--objective", help="objective text for the packet")
    p_add.add_argument("--objective-file", help="read the objective from this file")
    p_add.add_argument(
        "--commit-policy", choices=COMMIT_POLICIES, default="none", help="worker commit policy"
    )
    p_add.add_argument("--worktree", help="absolute path the worker should work in")
    p_add.add_argument(
        "--verify", action="append", default=[], help="verification command (repeatable)"
    )
    add_common(p_add)
    p_add.set_defaults(func=cmd_task_add)

    p_set = task_sub.add_parser("set", help="update task fields")
    p_set.add_argument("--task", required=True, help="task id, e.g. 01")
    p_set.add_argument("--status", help=f"one of: {', '.join(TASK_STATUSES)}")
    p_set.add_argument("--agent", help="name of the agent assigned to the task")
    p_set.add_argument("--worktree", help="absolute worktree path")
    p_set.add_argument("--commit-policy", help=f"one of: {', '.join(COMMIT_POLICIES)}")
    add_common(p_set)
    p_set.set_defaults(func=cmd_task_set)

    p_show = task_sub.add_parser("show", help="print a task packet")
    p_show.add_argument("--task", required=True, help="task id")
    add_common(p_show)
    p_show.set_defaults(func=cmd_task_show)

    p_list = task_sub.add_parser("list", help="list tasks (one line each)")
    add_common(p_list)
    p_list.set_defaults(func=cmd_task_list)

    p_event = sub.add_parser("event", help="append a worker event (also updates task status)")
    p_event.add_argument("--task", help="task id; omit for a run-level event")
    p_event.add_argument("--kind", required=True, choices=EVENT_KINDS, help="event kind")
    p_event.add_argument("--message", required=True, help="one-line message")
    p_event.add_argument("--by", help="actor name (default $AGENT_CONDUCTOR_ACTOR or 'unknown')")
    add_common(p_event)
    p_event.set_defaults(func=cmd_event)

    p_status = sub.add_parser("status", help="compact run dashboard")
    add_common(p_status)
    p_status.set_defaults(func=cmd_status)

    p_watch = sub.add_parser("watch", help="follow events.log and print matching event lines")
    p_watch.add_argument(
        "--kinds", help=f"comma-separated kinds (default: {','.join(DEFAULT_WATCH_KINDS)})"
    )
    p_watch.add_argument("--all", action="store_true", help="print every event kind")
    p_watch.add_argument("--from-start", action="store_true", help="replay existing lines first")
    p_watch.add_argument("--poll-seconds", type=float, default=2.0, help="poll interval")
    p_watch.add_argument(
        "--until",
        choices=("idle", "finished", "never"),
        default="idle",
        help="idle: stop when nothing is running; finished: stop when the run ends; never: run forever",
    )
    add_common(p_watch)
    p_watch.set_defaults(func=cmd_watch)

    p_check = sub.add_parser("check", help="plan-alignment gate (exit 1 on FAIL)")
    add_common(p_check)
    p_check.set_defaults(func=cmd_check)

    p_finish = sub.add_parser("finish", help="close the run")
    p_finish.add_argument("--status", required=True, choices=("done", "aborted"))
    p_finish.add_argument("--summary", help="one-paragraph outcome summary")
    add_common(p_finish)
    p_finish.set_defaults(func=cmd_finish)

    p_wt = sub.add_parser("worktree", help="manage per-task git worktrees")
    wt_sub = p_wt.add_subparsers(dest="worktree_command", required=True, metavar="<subcommand>")

    p_wt_add = wt_sub.add_parser("add", help="create a worktree and branch for a task")
    p_wt_add.add_argument("--task", required=True, help="task id")
    p_wt_add.add_argument("--base", help="base ref (default HEAD)")
    add_common(p_wt_add)
    p_wt_add.set_defaults(func=cmd_worktree_add)

    p_wt_rm = wt_sub.add_parser("remove", help="remove a task worktree")
    p_wt_rm.add_argument("--task", required=True, help="task id")
    p_wt_rm.add_argument("--delete-branch", action="store_true", help="also delete the branch")
    add_common(p_wt_rm)
    p_wt_rm.set_defaults(func=cmd_worktree_remove)

    p_wt_ls = wt_sub.add_parser("list", help="list task worktrees and whether they exist")
    add_common(p_wt_ls)
    p_wt_ls.set_defaults(func=cmd_worktree_list)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except ConductorError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except BrokenPipeError:
        return 0
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
