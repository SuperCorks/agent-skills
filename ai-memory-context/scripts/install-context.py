#!/usr/bin/env python3
"""Preview/apply the per-host context adapter without replacing unrelated config.

This installer deliberately does NOT approve/trust hooks, initialize a capture
boundary, import old sessions, or change repository markers.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import tempfile
import tomllib

EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact", "Stop", "SessionEnd")


def managed_command(command):
    if not isinstance(command, str):
        return False
    try:
        parts = shlex.split(command)
    except ValueError:
        return False
    return any(Path(part).name == "context_hook.py" for part in parts) or any(
        Path(part).name == "ai-memory" and "hook" in parts[index + 1:] and "--event" in parts[index + 1:]
        and all(prior == "env" or "=" in prior for prior in parts[:index])
        for index, part in enumerate(parts)
    )


def reconcile_hooks(original, hook_path, python_path):
    result = copy.deepcopy(original)
    hooks = result.setdefault("hooks", {})
    for event, groups in list(hooks.items()):
        kept = []
        for group in groups:
            retained = [entry for entry in group.get("hooks", []) if not managed_command(entry.get("command"))]
            if retained:
                kept.append({**group, "hooks": retained})
        if kept:
            hooks[event] = kept
        else:
            hooks.pop(event, None)
    for event in EVENTS:
        command = shlex.join([python_path, str(hook_path), event])
        hooks.setdefault(event, []).append({"hooks": [{"type": "command", "command": command, "timeout": 3}]})
    return result


def reconcile_codex(original):
    """Section-local TOML edits preserve unrelated values, comments, and trust."""
    tomllib.loads(original)
    sections = re.split(r"(?m)(?=^\s*\[(?!\[)[^\n]+\]\s*(?:#.*)?$)", original)
    kept = []
    for section in sections:
        header = re.match(r"\s*\[([^\n]+)\]", section)
        if header:
            key = header.group(1).replace('"', "").replace("'", "").strip()
            if any(key == f"mcp_servers.{name}" or key.startswith(f"mcp_servers.{name}.") for name in ("serena", "graphify")):
                continue
        kept.append(section)
    result = "".join(kept).rstrip() + '\n\n[mcp_servers.serena]\ncommand = "serena"\nargs = ["start-mcp-server", "--context=codex", "--open-web-dashboard=false"]\n'
    tomllib.loads(result)
    return result


def write_private(target, text, backup_dir):
    target = Path(target)
    backup_dir = Path(backup_dir)
    if target.is_symlink():
        raise ValueError(f"refusing symlink: {target}")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(backup_dir, 0o700)
    if target.exists():
        backup = backup_dir / target.name
        if backup.exists():
            raise ValueError(f"backup already exists: {backup}")
        shutil.copyfile(target, backup)
        os.chmod(backup, 0o600)
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write the previewed changes (does not trust hooks)")
    parser.add_argument("--home", type=Path, default=Path.home(), help="Host user's home; primarily useful for fixture tests")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--config-template", type=Path, help="Secret-free agent-memory config JSON")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    entrypoint = source / "scripts" / "agent-memory"
    hook_path = source / "scripts" / "context_hook.py"
    if not entrypoint.is_file() or not hook_path.is_file():
        parser.error("source must contain the complete ai-memory-context companion")
    task_home = args.home.expanduser().resolve()
    config_path = task_home / ".codex" / "config.toml"
    hooks_path = task_home / ".codex" / "hooks.json"
    runtime_path = task_home / ".config" / "agent-memory" / "config.json"
    for path in (config_path, hooks_path, runtime_path):
        if path.is_symlink():
            parser.error(f"refusing to replace symlink: {path}")
    original = config_path.read_text() if config_path.exists() else ""
    hooks = json.loads(hooks_path.read_text()) if hooks_path.exists() else {"hooks": {}}
    runtime = json.loads((args.config_template or runtime_path).read_text())
    if any(key in runtime for key in ("token", "auth_token", "authorization", "api_key")):
        parser.error("runtime config must reference auth_command or token_file, not inline credentials")
    # Use the same validator/resolver as the companion before changing anything.
    from agent_memory.config import Config
    Config.load(args.config_template or runtime_path)
    desired = {
        config_path: reconcile_codex(original),
        hooks_path: json.dumps(reconcile_hooks(hooks, str(hook_path), sys.executable), indent=2) + "\n",
        runtime_path: json.dumps(runtime, indent=2) + "\n",
    }
    link = task_home / ".local" / "bin" / "agent-memory"
    if link.exists() or link.is_symlink():
        if not link.is_symlink() or link.resolve() != entrypoint:
            parser.error(f"existing unrelated agent-memory entrypoint: {link}")
    changes = [path for path, value in desired.items() if not path.exists() or path.read_text() != value]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    backup = task_home / ".local" / "state" / "agent-memory" / "install-backups" / stamp
    if args.apply:
        for index, path in enumerate(changes):
            write_private(path, desired[path], backup / str(index))
        link.parent.mkdir(parents=True, exist_ok=True)
        if not link.is_symlink():
            link.symlink_to(entrypoint)
    print(json.dumps({"mode": "apply" if args.apply else "preview",
                      "changed_paths": [str(path) for path in changes],
                      "entrypoint": str(link), "backup_dir": str(backup) if args.apply and changes else None,
                      "next": "Initialize the forward-only boundary once, review changed hook definitions in Codex /hooks or app settings, reconnect MCP, then prove a native canary."}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        # Do not include source config values in errors.
        print(f"context installation failed: {type(error).__name__}", file=sys.stderr)
        raise SystemExit(1)
