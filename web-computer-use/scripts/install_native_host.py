#!/usr/bin/env python3
"""Preview native-host setup; write only when explicitly passed --install."""

import argparse
import json
import os
from pathlib import Path
import shlex
import sys
import tempfile

sys.dont_write_bytecode = True
from host_config import EXTENSION_DIR, HOST_NAME, allowed_origin, extension_id  # noqa: E402


def atomic_write(path, content, mode):
    fd, temporary = tempfile.mkstemp(prefix=".web-computer-use-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(content)
            output.flush()
            os.fchmod(output.fileno(), mode)
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def setup(manifest_dir, python, install=False):
    manifest_dir = manifest_dir.expanduser().absolute()
    python = Path(python).absolute()
    if not python.is_file() or not os.access(python, os.X_OK):
        raise ValueError("Python executable is missing or not executable")
    launcher = manifest_dir / f"{HOST_NAME}.host"
    manifest_path = manifest_dir / f"{HOST_NAME}.json"
    host_script = Path(__file__).resolve().with_name("native_host.py")
    manifest = {"name": HOST_NAME, "description": "Read-only Web Computer Use status",
                "path": str(launcher), "type": "stdio", "allowed_origins": [allowed_origin()]}
    wrapper = f'#!/bin/sh\nexec {shlex.quote(str(python))} -B {shlex.quote(str(host_script))} "$@"\n'
    if install:
        manifest_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        for destination in (launcher, manifest_path):
            if destination.is_symlink():
                raise ValueError(f"Refusing to replace symlink: {destination}")
        atomic_write(launcher, wrapper, 0o700)
        atomic_write(manifest_path, json.dumps(manifest, indent=2) + "\n", 0o600)
    return {"status": "installed" if install else "preview", "extension_id": extension_id(),
            "extension_directory": str(EXTENSION_DIR), "manifest_path": str(manifest_path),
            "launcher_path": str(launcher), "manifest": manifest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--manifest-dir", type=Path,
                        default=Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts")
    parser.add_argument("--python", default=sys.executable)
    args = parser.parse_args()
    try:
        print(json.dumps(setup(args.manifest_dir, args.python, args.install), indent=2))
        return 0
    except (ValueError, OSError) as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
