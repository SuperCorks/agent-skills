#!/usr/bin/env python3
"""Local Chromium bookmark merge and cookie mirror utility."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


HOME = Path.home()
SUPPORT = HOME / "Library" / "Application Support"
BACKUP_ROOT = SUPPORT / "browser-profile-sync-backups"

BROWSERS = {
    "chrome": {
        "profile": SUPPORT / "Google" / "Chrome" / "Default",
        "process": "Google Chrome",
    },
    "brave": {
        "profile": SUPPORT / "BraveSoftware" / "Brave-Browser" / "Default",
        "process": "Brave Browser",
    },
    "comet": {
        "profile": SUPPORT / "Comet" / "Default",
        "process": "Comet",
    },
}

ROOT_ORDER = ("bookmark_bar", "other", "synced")
ROOT_DISPLAY_NAMES = {
    "bookmark_bar": "Bookmarks Bar",
    "other": "Other Bookmarks",
    "synced": "Mobile Bookmarks",
}


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def chrome_time_now() -> str:
    # Microseconds between 1601-01-01 and 1970-01-01.
    unix_us = int(datetime.now(timezone.utc).timestamp() * 1_000_000)
    return str(unix_us + 11644473600 * 1_000_000)


def browser_path(browser: str, filename: str) -> Path:
    return BROWSERS[browser]["profile"] / filename


def is_running(browser: str) -> bool:
    proc = subprocess.run(
        ["pgrep", "-x", BROWSERS[browser]["process"]],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return proc.returncode == 0


def require_not_running(browsers: list[str], allow_running: bool) -> None:
    if allow_running:
        return
    running = [browser for browser in sorted(set(browsers)) if is_running(browser)]
    if running:
        names = ", ".join(running)
        raise SystemExit(
            f"Refusing to write while browser processes are running: {names}. "
            "Quit them first, or use --allow-running if you accept overwrite risk."
        )


def load_bookmarks(browser: str) -> dict:
    path = browser_path(browser, "Bookmarks")
    if not path.exists():
        raise SystemExit(f"{browser} has no Bookmarks file at {path}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def iter_url_nodes(node: dict, root_key: str, folder_path: tuple[str, ...] = (), *, is_root: bool = False):
    if node.get("type") == "url":
        yield {
            "node": node,
            "root": root_key,
            "folders": folder_path,
            "path": "/".join((root_key, *folder_path)),
            "title": node.get("name", ""),
            "url": node.get("url", ""),
        }
        return
    if node.get("type") != "folder":
        return
    name = node.get("name", "")
    next_path = folder_path
    if not is_root:
        next_path = (*folder_path, name)
    for child in node.get("children", []):
        yield from iter_url_nodes(child, root_key, next_path)


def iter_all_urls(data: dict, source: str):
    for root_key in ROOT_ORDER:
        root = data.get("roots", {}).get(root_key)
        if not root:
            continue
        for item in iter_url_nodes(root, root_key, is_root=True):
            item = dict(item)
            item["source"] = source
            yield item


def folder_exists(data: dict, root_key: str, folders: tuple[str, ...]) -> bool:
    node = data.get("roots", {}).get(root_key)
    if not node:
        return False
    for folder in folders:
        node = next(
            (
                child
                for child in node.get("children", [])
                if child.get("type") == "folder" and child.get("name") == folder
            ),
            None,
        )
        if node is None:
            return False
    return True


def ensure_folder(data: dict, root_key: str, folders: tuple[str, ...]) -> dict:
    node = data["roots"][root_key]
    for folder in folders:
        child = next(
            (
                candidate
                for candidate in node.setdefault("children", [])
                if candidate.get("type") == "folder" and candidate.get("name") == folder
            ),
            None,
        )
        if child is None:
            child = {
                "children": [],
                "date_added": chrome_time_now(),
                "date_last_used": "0",
                "date_modified": chrome_time_now(),
                "guid": str(uuid.uuid4()),
                "id": "0",
                "name": folder,
                "type": "folder",
            }
            node.setdefault("children", []).append(child)
        node["date_modified"] = chrome_time_now()
        node = child
    return node


def choose_destination(base_data: dict, source_item: dict) -> tuple[str, tuple[str, ...]]:
    root = source_item["root"]
    folders = source_item["folders"]
    imported_other = ("Other Bookmarks", *folders)
    if root == "other" and folder_exists(base_data, "bookmark_bar", imported_other):
        return "bookmark_bar", imported_other
    if root != "bookmark_bar" and folders and folder_exists(base_data, "bookmark_bar", folders):
        return "bookmark_bar", folders
    return root, folders


def clone_url_node(node: dict) -> dict:
    cloned = copy.deepcopy(node)
    cloned["id"] = "0"
    cloned["guid"] = str(uuid.uuid4())
    cloned.setdefault("date_added", chrome_time_now())
    cloned.setdefault("date_last_used", "0")
    return cloned


def reassign_ids(data: dict) -> None:
    next_id = 1

    def visit(node: dict) -> None:
        nonlocal next_id
        node["id"] = str(next_id)
        next_id += 1
        if node.get("type") == "folder":
            node.setdefault("children", [])
            node.setdefault("date_modified", chrome_time_now())
            node.setdefault("date_last_used", "0")
            for child in node["children"]:
                visit(child)
        else:
            node.setdefault("date_last_used", "0")

    for root_key in ROOT_ORDER:
        visit(data["roots"][root_key])


def bookmark_checksum(data: dict) -> str:
    hasher = hashlib.md5()

    def update(value: str, *, utf16: bool = False) -> None:
        hasher.update(value.encode("utf-16le" if utf16 else "utf-8"))

    def visit(node: dict) -> None:
        update(str(node.get("id", "")))
        update(node.get("name", ""), utf16=True)
        node_type = node.get("type", "")
        update(node_type)
        if node_type == "url":
            update(node.get("url", ""))
        elif node_type == "folder":
            for child in node.get("children", []):
                visit(child)

    for root_key in ROOT_ORDER:
        visit(data["roots"][root_key])
    return hasher.hexdigest()


def analyze_bookmarks(source_data: dict[str, dict], merged: dict, added: list[dict]) -> dict:
    source_items = []
    for source, data in source_data.items():
        source_items.extend(iter_all_urls(data, source))

    by_url = defaultdict(list)
    by_title = defaultdict(list)
    for item in source_items:
        by_url[item["url"]].append(item)
        title_key = item["title"].strip().casefold()
        if title_key:
            by_title[title_key].append(item)

    def compact(items: list[dict]) -> list[dict]:
        return [
            {
                "source": item["source"],
                "title": item["title"],
                "url": item["url"],
                "path": item["path"],
            }
            for item in items
        ]

    same_url_different_title = [
        {"url": url, "entries": compact(items)}
        for url, items in sorted(by_url.items())
        if len({item["title"] for item in items}) > 1
    ]
    same_title_different_url = [
        {"title": items[0]["title"], "entries": compact(items)}
        for _title, items in sorted(by_title.items())
        if len({item["url"] for item in items}) > 1
    ]
    merged_urls = list(iter_all_urls(merged, "merged"))
    return {
        "source_counts": {
            source: {
                "entries": len(list(iter_all_urls(data, source))),
                "unique_urls": len({item["url"] for item in iter_all_urls(data, source)}),
            }
            for source, data in source_data.items()
        },
        "source_total_entries": len(source_items),
        "source_unique_urls": len(by_url),
        "merged_entries": len(merged_urls),
        "merged_unique_urls": len({item["url"] for item in merged_urls}),
        "added_from_non_base_sources": added,
        "conflicts": {
            "same_url_different_title": same_url_different_title,
            "same_title_different_url": same_title_different_url,
        },
    }


def merge_bookmarks(base: str, sources: list[str]) -> tuple[dict, dict]:
    source_data = {source: load_bookmarks(source) for source in sources}
    if base not in source_data:
        source_data[base] = load_bookmarks(base)

    merged = copy.deepcopy(source_data[base])
    merged.pop("sync_metadata", None)
    merged.pop("checksum_sha256", None)
    for root_key in ROOT_ORDER:
        if root_key not in merged.get("roots", {}):
            raise SystemExit(f"Base bookmark file is missing root {root_key}")

    existing_urls = {item["url"] for item in iter_all_urls(merged, "merged")}
    added = []
    for source in sources:
        if source == base:
            continue
        for item in iter_all_urls(source_data[source], source):
            if item["url"] in existing_urls:
                continue
            dest_root, dest_folders = choose_destination(merged, item)
            parent = ensure_folder(merged, dest_root, dest_folders)
            parent.setdefault("children", []).append(clone_url_node(item["node"]))
            parent["date_modified"] = chrome_time_now()
            existing_urls.add(item["url"])
            added.append(
                {
                    "source": source,
                    "title": item["title"],
                    "url": item["url"],
                    "from": item["path"],
                    "to": "/".join((dest_root, *dest_folders)),
                }
            )

    reassign_ids(merged)
    merged["version"] = 1
    merged["checksum"] = bookmark_checksum(merged)
    report = analyze_bookmarks(source_data, merged, added)
    return merged, report


def backup_file(path: Path, backup_dir: Path, label: str) -> None:
    if not path.exists():
        return
    destination = backup_dir / label
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)


def write_bookmarks(targets: list[str], merged: dict, backup_dir: Path) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    content = json.dumps(merged, ensure_ascii=False, indent=3)
    for target in targets:
        profile = BROWSERS[target]["profile"]
        profile.mkdir(parents=True, exist_ok=True)
        bookmarks = profile / "Bookmarks"
        backup_file(bookmarks, backup_dir, f"{target}/Bookmarks")
        backup_file(profile / "Bookmarks.bak", backup_dir, f"{target}/Bookmarks.bak")
        bookmarks.write_text(content + "\n", encoding="utf-8")
        (profile / "Bookmarks.bak").write_text(content + "\n", encoding="utf-8")


def cookie_count(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            return int(conn.execute("select count(*) from cookies").fetchone()[0])
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def copy_cookie_db(source: str, targets: list[str], backup_dir: Path) -> dict:
    source_path = browser_path(source, "Cookies")
    if not source_path.exists():
        raise SystemExit(f"{source} has no Cookies database at {source_path}")
    backup_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "source": source,
        "source_count": cookie_count(source_path),
        "targets": {},
    }
    for target in targets:
        target_path = browser_path(target, "Cookies")
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_info = {
            "before_count": cookie_count(target_path),
            "after_count": None,
            "path": str(target_path),
        }
        for suffix in ("", "-journal", "-wal", "-shm"):
            backup_file(
                target_path.with_name(target_path.name + suffix),
                backup_dir,
                f"{target}/Cookies{suffix}",
            )
        shutil.copy2(source_path, target_path)
        for suffix in ("-journal", "-wal", "-shm"):
            sidecar = source_path.with_name(source_path.name + suffix)
            target_sidecar = target_path.with_name(target_path.name + suffix)
            if sidecar.exists():
                shutil.copy2(sidecar, target_sidecar)
            elif target_sidecar.exists():
                target_sidecar.unlink()
        target_info["after_count"] = cookie_count(target_path)
        result["targets"][target] = target_info
    return result


def command_bookmarks(args: argparse.Namespace) -> int:
    merged, report = merge_bookmarks(args.base, args.sources)
    backup_dir = Path(args.backup_dir or BACKUP_ROOT / now_stamp()).expanduser()
    if args.report:
        report_path = Path(args.report).expanduser()
    else:
        report_path = backup_dir / "bookmark-merge-report.json"
    report["backup_dir"] = str(backup_dir)
    report["targets"] = args.targets
    report["applied"] = bool(args.apply)

    if args.apply:
        require_not_running(args.targets, args.allow_running)
        write_bookmarks(args.targets, merged, backup_dir)

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def command_cookies(args: argparse.Namespace) -> int:
    backup_dir = Path(args.backup_dir or BACKUP_ROOT / now_stamp()).expanduser()
    summary = {
        "source": args.source,
        "targets": args.targets,
        "source_count": cookie_count(browser_path(args.source, "Cookies")),
        "target_counts": {
            target: cookie_count(browser_path(target, "Cookies")) for target in args.targets
        },
        "backup_dir": str(backup_dir),
        "applied": bool(args.apply),
        "note": (
            "Cookie mirroring replaces target cookie databases. It does not print cookie values. "
            "Chromium apps may reject copied encrypted cookies if their local encryption keys differ."
        ),
    }
    if args.apply:
        require_not_running([args.source, *args.targets], args.allow_running)
        summary["mirror_result"] = copy_cookie_db(args.source, args.targets, backup_dir)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    bookmark = sub.add_parser("bookmarks", help="merge Chromium bookmark files")
    bookmark.add_argument("--base", choices=BROWSERS, default="comet")
    bookmark.add_argument("--sources", choices=BROWSERS, nargs="+", default=["brave", "comet"])
    bookmark.add_argument("--targets", choices=BROWSERS, nargs="+", default=["chrome", "brave"])
    bookmark.add_argument("--report")
    bookmark.add_argument("--backup-dir")
    bookmark.add_argument("--apply", action="store_true")
    bookmark.add_argument("--allow-running", action="store_true")
    bookmark.set_defaults(func=command_bookmarks)

    cookies = sub.add_parser("cookies", help="mirror one browser cookie database to targets")
    cookies.add_argument("--source", choices=BROWSERS, required=True)
    cookies.add_argument("--targets", choices=BROWSERS, nargs="+", required=True)
    cookies.add_argument("--backup-dir")
    cookies.add_argument("--apply", action="store_true")
    cookies.add_argument("--allow-running", action="store_true")
    cookies.set_defaults(func=command_cookies)

    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
