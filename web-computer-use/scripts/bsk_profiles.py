#!/usr/bin/env python3
"""Map BrowserSkill (bsk) instance IDs to Chrome and Brave profile names.

Each profile's BrowserSkill extension keeps its instance ID under the
`bsk_instance_id` key of its own extension-settings store. This helper reads
only that key from only that store, plus display names from `Local State`
`profile.info_cache`. It never reads cookies, history, other extensions'
storage, or other profile data.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


EXTENSION_ID = "hhcmgoofomhgciiibhipgmgkgnoenaoi"
SUPPORT = Path.home() / "Library/Application Support"
ROOTS = {
    "chrome": SUPPORT / "Google/Chrome",
    "brave": SUPPORT / "BraveSoftware/Brave-Browser",
}
APPS = {"chrome": "Google Chrome", "brave": "Brave Browser"}
DEFAULT_REGISTRY = Path.home() / ".local/state/web-computer-use/bsk-profiles.json"
STORED_ID = re.compile(rb'bsk_instance_id[\s\S]{0,4}?"([0-9a-f]{8})"')
INSTANCE_ID = re.compile(r"[0-9a-f]{8}")


class ProfileError(Exception):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code = code
        self.details = details


def emit(value, stream=None):
    print(json.dumps(value, sort_keys=True), file=stream or sys.stdout, flush=True)


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def settings_dir(root, profile_dir):
    return root / profile_dir / "Local Extension Settings" / EXTENSION_ID


def store_files(store):
    # LevelDB file numbers increase over time; keep that order for readable output.
    files = [path for path in store.iterdir() if path.suffix in (".log", ".ldb")]
    return sorted(files, key=lambda path: (int(path.stem) if path.stem.isdigit() else -1, path.name))


def stored_ids(store, connected_ids=()):
    """IDs saved under bsk_instance_id, plus connected IDs present verbatim (compressed tables)."""
    found = []
    for path in store_files(store):
        data = path.read_bytes()
        for match in STORED_ID.finditer(data):
            found.append(match.group(1).decode())
        for instance_id in connected_ids:
            if f'"{instance_id}"'.encode() in data:
                found.append(instance_id)
    return list(dict.fromkeys(found))


def connected_browsers(bsk):
    """Return ({instance_id: connection}, error). A bsk failure never blocks the disk scan."""
    executable = shutil.which(bsk) or (str(Path.home() / ".local/bin/bsk") if bsk == "bsk" else bsk)
    try:
        result = subprocess.run([executable, "browsers", "--json"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, str(exc)
    if result.returncode != 0:
        return None, (result.stderr or result.stdout).strip() or f"bsk exited {result.returncode}"
    try:
        return {item["instance_id"]: item for item in json.loads(result.stdout)}, None
    except (ValueError, KeyError, TypeError) as exc:
        return None, f"Unreadable bsk browsers output: {exc}"


def scan_profiles(roots, connections):
    connected_ids = list(connections or ())
    profiles = []
    for browser, root in roots.items():
        try:
            cache = json.loads((root / "Local State").read_text())["profile"]["info_cache"]
        except (OSError, ValueError, KeyError, TypeError):
            continue
        for profile_dir, info in sorted(cache.items()):
            if not (root / profile_dir).is_dir():
                continue
            store = settings_dir(root, profile_dir)
            installed = store.is_dir() or (root / profile_dir / "Extensions" / EXTENSION_ID).is_dir()
            candidates = stored_ids(store, connected_ids) if store.is_dir() else []
            profiles.append({"browser": browser, "profile_dir": profile_dir,
                             "profile_name": info.get("name") or profile_dir,
                             "extension": "installed" if installed else "missing",
                             "candidates": candidates})
    return profiles


def choose_ids(profiles, connections):
    for profile in profiles:
        candidates = profile.pop("candidates")
        live = [instance_id for instance_id in candidates if connections and instance_id in connections]
        if profile["extension"] == "missing":
            profile.update(instance_id=None, status="extension_missing")
        elif len(candidates) == 1:
            profile.update(instance_id=candidates[0], status="ok")
        elif len(live) == 1:
            profile.update(instance_id=live[0], status="ok")
        else:
            profile.update(instance_id=None, status="unresolved", candidates=candidates)
    # A copied profile folder can carry another profile's ID; never pick between them.
    owners = {}
    for profile in profiles:
        if profile["instance_id"]:
            owners.setdefault(profile["instance_id"], []).append(profile)
    for instance_id, matches in owners.items():
        if len(matches) > 1:
            for profile in matches:
                profile.update(instance_id=None, status="unresolved", candidates=[instance_id])
    return profiles


def refresh(registry_path=DEFAULT_REGISTRY, roots=None, bsk="bsk", connections=None, bsk_error=None):
    if connections is None and bsk_error is None:
        connections, bsk_error = connected_browsers(bsk)
    try:
        previous = {(item["browser"], item["profile_dir"]): item
                    for item in json.loads(Path(registry_path).read_text()).get("profiles", [])}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        previous = {}
    timestamp = now_iso()
    profiles = choose_ids(scan_profiles(roots or ROOTS, connections), connections)
    for profile in profiles:
        old = previous.get((profile["browser"], profile["profile_dir"]), {})
        same = profile["instance_id"] and old.get("instance_id") == profile["instance_id"]
        live = (connections or {}).get(profile["instance_id"]) if profile["instance_id"] else None
        profile["connected"] = None if connections is None else live is not None
        profile["label"] = (live or {}).get("label") or (old.get("label") if same else "") or ""
        profile["verified_at"] = timestamp if profile["status"] == "ok" else None
        profile["last_connected_at"] = timestamp if live else (old.get("last_connected_at") if same else None)
    known = {profile["instance_id"] for profile in profiles}
    unknown = [{"instance_id": instance_id, "browser_name": item.get("browser_name"),
                "browser_version": item.get("browser_version"), "label": item.get("label") or ""}
               for instance_id, item in sorted((connections or {}).items()) if instance_id not in known]
    registry = {"updated_at": timestamp, "profiles": profiles, "unknown_connections": unknown}
    if bsk_error:
        registry["bsk_error"] = bsk_error
    write_registry(Path(registry_path), registry)
    return registry


def write_registry(path, registry):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".bsk-profiles-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(registry, output, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def resolve(registry, name, browser=None):
    pool = [profile for profile in registry["profiles"] if browser in (None, profile["browser"])]
    wanted = name.casefold()
    # Display names win; a folder name such as "Profile 7" is accepted only when no name matches.
    matches = ([profile for profile in pool if profile["profile_name"].casefold() == wanted]
               or [profile for profile in pool if profile["profile_dir"].casefold() == wanted])
    if not matches:
        raise ProfileError("not_found", f"No {browser or 'Chrome or Brave'} profile is named {name!r}.",
                           profiles=sorted(f"{p['browser']}: {p['profile_name']}" for p in pool))
    if len(matches) > 1:
        raise ProfileError("ambiguous", f"{len(matches)} profiles match {name!r}; pass --browser or a folder name.",
                           matches=[{key: p[key] for key in ("browser", "profile_dir", "profile_name")} for p in matches])
    profile = matches[0]
    open_command = ["open", "-na", APPS[profile["browser"]], "--args", f"--profile-directory={profile['profile_dir']}"]
    if profile["status"] == "extension_missing":
        raise ProfileError("extension_missing", "BrowserSkill is not installed in this profile; ask the user to install it.",
                           profile=profile)
    if profile["status"] != "ok":
        raise ProfileError("unresolved", "The stored instance ID could not be read unambiguously. Open the profile, "
                           "wait for its connection, and rerun; ask the user to copy the popup's profile "
                           "instructions if it stays unresolved.", profile=profile, open_command=open_command)
    return {"status": "ok", **profile, "open_command": None if profile["connected"] else open_command}


def table(registry):
    rows = [("INSTANCE", "BROWSER", "PROFILE", "FOLDER", "CONNECTED", "STATUS")]
    for profile in registry["profiles"]:
        connected = {True: "yes", False: "no", None: "?"}[profile["connected"]]
        rows.append((profile["instance_id"] or "-", profile["browser"], profile["profile_name"],
                     profile["profile_dir"], connected, profile["status"]))
    for item in registry["unknown_connections"]:
        rows.append((item["instance_id"], item["browser_name"] or "?", "(unknown)", "-", "yes", "unknown"))
    widths = [max(len(row[index]) for row in rows) for index in range(len(rows[0]))]
    lines = ["  ".join(cell.ljust(width) for cell, width in zip(row, widths)).rstrip() for row in rows]
    if registry.get("bsk_error"):
        lines.append(f"bsk browsers failed, connection state unknown: {registry['bsk_error']}")
    return "\n".join(lines)


class JsonParser(argparse.ArgumentParser):
    def error(self, message):
        raise ProfileError("invalid_request", message)


def parser():
    result = JsonParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY, help="Override only for isolated tests.")
    result.add_argument("--bsk", default="bsk", help="bsk executable.")
    commands = result.add_subparsers(dest="command")
    listing = commands.add_parser("list", help="Refresh and print every profile (default).")
    listing.add_argument("--json", action="store_true")
    lookup = commands.add_parser("resolve", help="Refresh and print one profile's instance ID as JSON.")
    lookup.add_argument("name", help="Profile display name, or its folder name such as 'Profile 7'.")
    lookup.add_argument("--browser", choices=sorted(ROOTS))
    return result


def main(argv=None, roots=None):
    try:
        args = parser().parse_args(argv)
        registry = refresh(args.registry, roots, args.bsk)
        if args.command == "resolve":
            emit(resolve(registry, args.name, args.browser))
        elif getattr(args, "json", False):
            emit(registry)
        else:
            print(table(registry))
        return 0
    except ProfileError as exc:
        emit({"status": "error", "code": exc.code, "message": str(exc), **exc.details})
        return 1
    except OSError as exc:
        emit({"status": "error", "code": "io_error", "message": str(exc)})
        return 2


if __name__ == "__main__":
    sys.exit(main())
