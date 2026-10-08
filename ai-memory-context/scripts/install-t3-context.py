#!/usr/bin/env python3
"""Preview/apply context configuration to T3's actual provider homes.

No credentials are copied between accounts, offsets reset, hook trust changed,
or old transcripts imported. Replaced skills are moved to a private backup.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tomllib
from datetime import datetime, timezone

from agent_memory.config import Config

spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install-context.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def plan(task_home, settings, runtime, source, python_path, serena_path, token=None):
    """Only managed hooks/MCP entries/skills and capture roots are reconciled."""
    writes, links, roots, profiles = {}, {}, set(runtime.get("transcript_roots", [])), []
    source = Path(source)
    hook = source / "ai-memory-context/scripts/context_hook.py"
    context_skills = [p for p in source.iterdir() if p.is_dir() and (
        p.name in {"ai-memory-context", "serena-context", "graphify-context"} or p.name.startswith("ai-memory-"))]
    claude_homes = {task_home / ".claude"}
    for name, instance in settings.get("providerInstances", {}).items():
        if instance.get("enabled") is False:
            continue
        config = instance.get("config", {})
        driver = instance.get("driver")
        homes = [Path(str(config[k]).replace("~", str(task_home), 1)).resolve() for k in ("homePath", "shadowHomePath") if config.get(k)]
        profiles.append({"profile": name, "driver": driver, "homes": [str(p) for p in homes]})
        if driver == "claudeAgent":
            claude_homes.update(homes)
        elif driver == "codex":
            for home in homes:
                roots.update(str((home / n).resolve()) for n in ("sessions", "archived_sessions"))
    for home in sorted(claude_homes):
        roots.add(str((home / "projects").resolve()))
        # Follow portable settings links, but never link account .claude.json:
        # that file also owns onboarding and account-specific runtime state.
        target = (home / "settings.json").resolve()
        fallback = task_home / ".claude/settings.json"
        current = json.loads(target.read_text()) if target.exists() else (json.loads(fallback.read_text()) if fallback.exists() else {})
        writes[target] = installer.reconcile_claude_hooks(current, hook, python_path, replace_native=True)
        target = (home / ".claude.json").resolve()
        current = json.loads(target.read_text()) if target.exists() else {}
        servers = current.setdefault("mcpServers", {})
        servers["serena"] = {"type": "stdio", "command": serena_path,
            "args": ["start-mcp-server", "--context=claude-code", "--open-web-dashboard=false"]}
        if token is not None:
            servers["ai-memory"] = {"type": "http", "url": runtime["server_url"].rstrip("/") + "/mcp",
                "headers": {"Authorization": "Bearer " + token}}
        writes[target] = current
        if not (home / "CLAUDE.md").exists():
            # Existing global instructions stay untouched.
            writes[home / "CLAUDE.md"] = "@~/.agents/AGENTS.md\n"
        skill_root = (home / "skills").resolve()
        for skill in context_skills:
            target = skill_root / skill.name
            if not target.is_symlink() or target.resolve() != skill.resolve():
                links[target] = skill.resolve()
    runtime = {**runtime, "transcript_roots": sorted(roots), "capture_profiles": profiles}
    # Validate identities/roots without obtaining a credential.
    Config(runtime)
    writes[task_home / ".config/agent-memory/config.json"] = runtime
    return writes, links, profiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--settings", type=Path, help="T3 settings (default ~/.t3-fork/userdata/settings.json)")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--repo", type=Path, action="append", default=[], help="Explicitly enroll an additional repository marker (no history import)")
    args = parser.parse_args()
    task_home = args.home.expanduser().resolve()
    settings_path = args.settings or task_home / ".t3-fork/userdata/settings.json"
    runtime_path = task_home / ".config/agent-memory/config.json"
    runtime = json.loads(runtime_path.read_text())
    for repo in args.repo:
        root = repo.expanduser().resolve()
        marker = tomllib.loads((root / ".ai-memory.toml").read_text())
        scope = {k: marker[k] for k in ("workspace", "project")}
        for field in ("allowed_scopes", "native_allowed_scopes"):
            entries = runtime.setdefault(field, list(runtime["allowed_scopes"]))
            if not any(all(entry.get(k) == scope[k] for k in scope) for entry in entries):
                entries.append(scope)
    settings = json.loads(settings_path.read_text())
    serena = shutil.which("serena")
    if not serena:
        parser.error("install Serena on this host before applying a provider profile")
    # Credential never appears in argv, stdout, source, or a preview diff.
    config = Config(runtime, runtime_path)
    writes, links, profiles = plan(task_home, settings, runtime, task_home / ".agents/skills",
                                 sys.executable, serena, config.token())
    encoded = {path: value if isinstance(value, str) else json.dumps(value, indent=2) + "\n" for path, value in writes.items()}
    changed = {path: value for path, value in encoded.items() if not path.exists() or path.read_text() != value}
    backup = task_home / ".local/state/agent-memory/install-backups" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ") + "-t3")
    if args.apply:
        for index, (path, value) in enumerate(changed.items()):
            installer.write_private(path, value, backup / str(index))
        for index, (target, source) in enumerate(links.items()):
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() or target.is_symlink():
                backup.mkdir(parents=True, exist_ok=True, mode=0o700)
                os.chmod(backup, 0o700)
                target.rename(backup / f"skill-{index}-{target.name}")
            target.symlink_to(source, target_is_directory=True)
    print(json.dumps({"mode": "apply" if args.apply else "preview", "profiles": profiles,
        "changed_paths": [str(p) for p in changed], "skill_links": [str(p) for p in links],
        "backup_dir": str(backup) if args.apply and (changed or links) else None,
        "next": "Start/reconnect provider sessions to reload settings; prove native capture and actual MCP availability. No old history was imported."}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never include configuration or a credential-bearing provider response.
        print("T3 context installation failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
