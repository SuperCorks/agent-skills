#!/usr/bin/env python3
"""Read-only APFS disk and directory measurements for macOS."""

import argparse
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile


def diskutil(*args):
    result = subprocess.run(["/usr/sbin/diskutil", *args], capture_output=True, check=True, timeout=30)
    return plistlib.loads(result.stdout)


def snapshot(mount):
    device = diskutil("info", "-plist", mount)["DeviceIdentifier"]
    containers = diskutil("apfs", "list", "-plist").get("Containers", [])
    for container in containers:
        if not any(volume.get("DeviceIdentifier") == device for volume in container["Volumes"]):
            continue
        capacity = container["CapacityCeiling"]
        free = container["CapacityFree"]
        return {
            "mount": mount,
            "device": device,
            "container": container["ContainerReference"],
            "capacity_bytes": capacity,
            "used_bytes": capacity - free,
            "free_bytes": free,
            "volumes": [
                {
                    "name": volume.get("Name"),
                    "device": volume["DeviceIdentifier"],
                    "roles": volume.get("Roles", []),
                    "used_bytes": volume.get("CapacityInUse"),
                }
                for volume in container["Volumes"]
            ],
        }
    raise ValueError(f"{mount} did not resolve to a mounted APFS volume")


def scan(paths, depth):
    roots = [str(Path(path).expanduser().resolve(strict=True)) for path in paths]
    source = Path(__file__).resolve().with_name("apfs_scan.c")
    with tempfile.TemporaryDirectory(prefix="mac-storage-probe-") as scratch:
        binary = str(Path(scratch) / "apfs-scan")
        subprocess.run(
            ["/usr/bin/xcrun", "clang", "-O2", "-Wall", "-Wextra", str(source), "-o", binary],
            check=True,
            timeout=30,
        )
        return subprocess.run([binary, str(depth), *roots]).returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="mode", required=True)
    snap = commands.add_parser("snapshot", help="Get APFS container and volume usage as JSON")
    snap.add_argument("--mount", default="/System/Volumes/Data")
    directory = commands.add_parser("scan", help="Measure one or more directory trees as JSON lines")
    directory.add_argument("--depth", default=1, type=int, help="Levels of directory rows to print")
    directory.add_argument("paths", nargs="+")
    args = parser.parse_args()

    if sys.platform != "darwin":
        parser.error("this probe requires macOS")
    if args.mode == "scan" and args.depth < 0:
        parser.error("--depth must be zero or greater")
    try:
        if args.mode == "snapshot":
            print(json.dumps(snapshot(args.mount), indent=2))
            return 0
        return scan(args.paths, args.depth)
    except (OSError, RuntimeError, KeyError, ValueError, subprocess.SubprocessError) as exc:
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            message = exc.stderr.decode(errors="replace").strip()
        else:
            message = str(exc)
        print(f"storage probe: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
