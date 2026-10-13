#!/usr/bin/env python3
"""Read T3 Code's local projections and resolve desktop thread deep links."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from urllib.parse import unquote, urlsplit


SCHEMES = {"t3cork", "t3cork-dev", "t3cork-preview"}
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z")


def parse_link(link):
    url = urlsplit(link)
    parts = [unquote(part, errors="strict").strip() for part in url.path.split("/") if part]
    if (
        url.scheme.lower() not in SCHEMES
        or url.netloc.lower() != "app"
        or len(parts) != 2
        or parts[0] == "new"
        or not all(IDENTIFIER.fullmatch(part) for part in parts)
    ):
        raise ValueError("expected t3cork://app/<environment-id>/<thread-id> (an existing thread)")
    return parts


def databases(args):
    if args.db:
        path = Path(args.db).expanduser().resolve()
        if not path.is_file():
            raise ValueError(f"database not found: {path}")
        return [path]
    if args.t3_home:
        bases = [Path(args.t3_home).expanduser()]
    else:
        bases = [Path.home() / ".t3", Path.home() / ".t3-fork"]
        if os.environ.get("T3CODE_HOME"):
            bases.insert(0, Path(os.environ["T3CODE_HOME"]).expanduser())
        # Implicit development runs may use a worktree-local .t3/dev store.
        bases.extend(parent / ".t3" for parent in [Path.cwd(), *Path.cwd().parents])
    paths = []
    for base in bases:
        for state_dir in (base / "userdata", base / "dev", base):
            path = (state_dir / "state.sqlite").resolve()
            if path.is_file() and path not in paths:
                paths.append(path)
    return paths


def open_database(path):
    # Do not use immutable=1: an active T3 process may have messages in the WAL.
    db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("BEGIN")
    return db


def has_table(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def environment_id(path):
    file = path.parent / "environment-id"
    return file.read_text().strip() if file.is_file() else None


def thread_record(db, path, row):
    thread = dict(row)
    env = environment_id(path)
    record = {
        "source": "t3-code",
        "store": "sqlite_projection",
        "environment_id": env,
        "thread_id": thread["thread_id"],
        "session_id": thread["thread_id"],
        "title": thread["title"],
        "created_at": thread["created_at"],
        "updated_at": thread["updated_at"],
        "archived_at": thread.get("archived_at"),
        "deleted_at": thread.get("deleted_at"),
        "db": str(path),
    }
    if env and IDENTIFIER.fullmatch(env) and IDENTIFIER.fullmatch(thread["thread_id"]):
        record["deep_link"] = f"t3cork://app/{env}/{thread['thread_id']}"
    if has_table(db, "projection_projects") and thread.get("project_id"):
        project = db.execute("SELECT title, workspace_root FROM projection_projects WHERE project_id=?", (thread["project_id"],)).fetchone()
        if project:
            record.update(project_title=project["title"], cwd=project["workspace_root"])
    return record


def inventory(args):
    for path in databases(args):
        try:
            with closing(open_database(path)) as db:
                if not has_table(db, "projection_threads"):
                    continue
                for row in db.execute("SELECT * FROM projection_threads ORDER BY updated_at DESC, thread_id"):
                    yield thread_record(db, path, row)
        except (OSError, sqlite3.Error) as error:
            print(f"could not read T3 database {path}: {error}", file=sys.stderr)


def find_thread(args):
    env, thread_id = parse_link(args.link) if args.link else (None, args.thread)
    if not thread_id or not IDENTIFIER.fullmatch(thread_id):
        raise ValueError("provide --link or a valid --thread ID")
    matches = []
    checked = []
    for path in databases(args):
        checked.append(str(path))
        actual_env = environment_id(path)
        if env and env != actual_env:
            continue
        with closing(open_database(path)) as db:
            if not has_table(db, "projection_threads"):
                continue
            row = db.execute("SELECT * FROM projection_threads WHERE thread_id=?", (thread_id,)).fetchone()
            if row:
                matches.append((path, thread_record(db, path, row)))
    if not matches:
        detail = "; checked: " + ", ".join(checked) if checked else "; no local T3 databases found"
        target = f" in environment {env}" if env else ""
        raise ValueError(
            f"T3 thread {thread_id} not found{target}{detail}. "
            "Use --t3-home or --db for another store. A remote environment must be read on its host; "
            "the link's thread ID is not a native Codex/Claude session ID."
        )
    if len(matches) > 1:
        raise ValueError("multiple databases contain this thread; select one with --db: " + ", ".join(str(path) for path, _ in matches))
    return matches[0]


def session_mapping(db, thread_id):
    mapping = {}
    session = {}
    if has_table(db, "projection_thread_sessions"):
        row = db.execute("SELECT * FROM projection_thread_sessions WHERE thread_id=?", (thread_id,)).fetchone()
        session = dict(row) if row else {}
        mapping = {key: session.get(key) for key in ("provider_name", "provider_instance_id")}
    cursor = {}
    if has_table(db, "provider_session_runtime"):
        row = db.execute("SELECT * FROM provider_session_runtime WHERE thread_id=?", (thread_id,)).fetchone()
        if row:
            runtime = dict(row)
            for key in ("provider_name", "provider_instance_id"):
                mapping[key] = runtime.get(key) or mapping.get(key)
            try:
                cursor = json.loads(runtime.get("resume_cursor_json") or "{}")
            except (ValueError, TypeError):
                pass
    provider = mapping.get("provider_name") or ""
    native_id = None
    if isinstance(cursor, dict):
        if provider.lower().startswith("claude"):
            native_id = cursor.get("resume")
        elif provider.lower() == "codex":
            native_id = cursor.get("threadId")
    mapping["native_session_id"] = native_id or session.get("provider_thread_id")
    return mapping


def resolve(args):
    path, record = find_thread(args)
    with closing(open_database(path)) as db:
        record.update(session_mapping(db, record["thread_id"]))
        counts = {row["role"]: row["count"] for row in db.execute(
            "SELECT role, COUNT(*) AS count FROM projection_thread_messages WHERE thread_id=? GROUP BY role",
            (record["thread_id"],),
        )}
        record.update(message_count=sum(counts.values()), message_counts_by_role=counts)
    print(json.dumps(record, ensure_ascii=False))


def show(args):
    path, record = find_thread(args)
    roles = ("user", "assistant", "reasoning") if args.include_reasoning else ("user", "assistant")
    with closing(open_database(path)) as db:
        placeholders = ",".join("?" for _ in roles)
        rows = list(db.execute(
            f"SELECT * FROM projection_thread_messages WHERE thread_id=? AND role IN ({placeholders}) ORDER BY created_at, message_id",
            (record["thread_id"], *roles),
        ))
    if args.limit:
        rows = rows[-args.limit:]
    print(f"Thread: {record['title']}\nLink: {record.get('deep_link', '(environment-id unavailable)')}\nDatabase: {path}\n")
    for row in rows:
        message = dict(row)
        text = message["text"]
        attachments = message.get("attachments_json")
        if attachments and attachments != "[]":
            text += "\n[attachments; metadata in projection_thread_messages.attachments_json]"
        print(f"{message['role']}: {text}\n")


def positive_int(raw):
    number = int(raw)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("inventory", "subjects", "resolve", "show"):
        sub = commands.add_parser(command)
        stores = sub.add_mutually_exclusive_group()
        stores.add_argument("--db", help="explicit state.sqlite path")
        stores.add_argument("--t3-home", help="T3 base directory (userdata/dev discovered beneath it)")
        if command in ("resolve", "show"):
            targets = sub.add_mutually_exclusive_group(required=True)
            targets.add_argument("--link", help="t3cork://app/<environment-id>/<thread-id>")
            targets.add_argument("--thread", help="T3 thread ID, for an explicitly selected or local store")
        if command in ("subjects", "show"):
            sub.add_argument("--limit", type=positive_int, default=5 if command == "subjects" else None)
        if command == "show":
            sub.add_argument("--include-reasoning", action="store_true", help="include separately stored reasoning messages")
    args = parser.parse_args()
    try:
        if args.command == "inventory":
            for record in inventory(args):
                print(json.dumps(record, ensure_ascii=False))
        elif args.command == "subjects":
            records = sorted((row for row in inventory(args) if not row["deleted_at"]), key=lambda row: row["updated_at"], reverse=True)
            print("## T3 Code")
            for record in records[:args.limit]:
                print(f"- {record['title']} ({record['updated_at']}, {record.get('deep_link', record['thread_id'])})")
            print()
        elif args.command == "resolve":
            resolve(args)
        else:
            show(args)
    except (ValueError, OSError, sqlite3.Error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
