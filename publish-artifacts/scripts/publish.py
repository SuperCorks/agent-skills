#!/usr/bin/env python3
"""Publish files to Simon's public Google Cloud Storage bucket."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_ACCOUNT = os.environ.get("PERSONAL_GCS_ACCOUNT", "sim")
DEFAULT_PROJECT = os.environ.get("PERSONAL_GCS_PROJECT", "my-project-1478832460965")
DEFAULT_BUCKET = os.environ.get(
    "PERSONAL_GCS_BUCKET", "simon-personal-files-1478832460965"
)
DEFAULT_PUBLIC_BASE = os.environ.get(
    "PERSONAL_GCS_PUBLIC_BASE",
    f"https://{DEFAULT_BUCKET}.storage.googleapis.com",
).rstrip("/")

SKIP_NAMES = {".DS_Store"}
NO_CACHE_SUFFIXES = {
    ".css",
    ".csv",
    ".htm",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".txt",
    ".webmanifest",
    ".xml",
}
SPECIAL_CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml; charset=utf-8",
}


class PublishError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class UploadItem:
    local_path: Path
    object_name: str
    size: int
    sha256: str
    content_type: str
    cache_control: str

    @property
    def canonical_url(self) -> str:
        return f"{DEFAULT_PUBLIC_BASE}/{quote(self.object_name, safe='/')}"

    @property
    def public_url(self) -> str:
        return f"{self.canonical_url}?v={self.sha256[:16]}"


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish a file or directory to Simon's public GCS bucket."
    )
    parser.add_argument("source", type=Path, help="File or directory to publish")
    parser.add_argument(
        "--folder",
        help="GCS destination folder (default: artifacts/YYYY-MM-DD)",
    )
    parser.add_argument(
        "--name",
        help="Override the uploaded filename or directory root name",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing objects; requires prior user confirmation",
    )
    parser.add_argument(
        "--confirm-public",
        action="store_true",
        help="Acknowledge public exposure and possible storage/egress charges",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the upload plan without contacting Google Cloud",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable output",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=1000,
        help="Refuse directories with more files (default: 1000)",
    )
    parser.add_argument(
        "--max-total-mb",
        type=float,
        default=500.0,
        help="Refuse a source larger than this many MiB (default: 500)",
    )
    args = parser.parse_args(argv)
    if not args.dry_run and not args.confirm_public:
        parser.error(
            "live uploads require --confirm-public after the user approves public "
            "exposure and possible Google Cloud charges"
        )
    if args.max_files < 1 or args.max_total_mb <= 0:
        parser.error("--max-files and --max-total-mb must be positive")
    return args


def normalize_object_part(value: str, label: str) -> str:
    raw = value.strip().strip("/")
    if not raw:
        raise PublishError(f"{label} cannot be empty")
    if "\\" in raw:
        raise PublishError(f"{label} must use forward slashes")
    parts = raw.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise PublishError(f"{label} contains an invalid path segment")
    return "/".join(parts)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in SPECIAL_CONTENT_TYPES:
        return SPECIAL_CONTENT_TYPES[suffix]
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed:
        if guessed.startswith("text/"):
            return f"{guessed}; charset=utf-8"
        return guessed
    return "application/octet-stream"


def cache_control_for(path: Path) -> str:
    if path.suffix.lower() in NO_CACHE_SUFFIXES:
        return "no-cache"
    return "public,max-age=3600"


def source_files(source: Path) -> list[tuple[Path, Path]]:
    if source.is_symlink():
        raise PublishError("symlink sources are not allowed")
    if source.is_file():
        return [(source, Path(source.name))]
    if not source.is_dir():
        raise PublishError(f"source does not exist or is not a regular file: {source}")

    files: list[tuple[Path, Path]] = []
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise PublishError(f"symlinks are not allowed: {path}")
        if path.is_file() and path.name not in SKIP_NAMES:
            files.append((path, path.relative_to(source)))
    if not files:
        raise PublishError(f"directory contains no publishable files: {source}")
    return files


def build_plan(args: argparse.Namespace) -> list[UploadItem]:
    source = args.source.expanduser().resolve()
    folder = normalize_object_part(
        args.folder or f"artifacts/{dt.date.today().isoformat()}", "folder"
    )
    pairs = source_files(source)
    root_name = normalize_object_part(args.name or source.name, "name")

    if source.is_file():
        mappings = [(pairs[0][0], f"{folder}/{root_name}")]
    else:
        mappings = [
            (local, f"{folder}/{root_name}/{relative.as_posix()}")
            for local, relative in pairs
        ]

    if len(mappings) > args.max_files:
        raise PublishError(
            f"refusing {len(mappings)} files; raise --max-files after reviewing the source"
        )
    total = sum(path.stat().st_size for path, _ in mappings)
    limit = int(args.max_total_mb * 1024 * 1024)
    if total > limit:
        raise PublishError(
            f"refusing {format_bytes(total)}; raise --max-total-mb after reviewing the source"
        )

    return [
        UploadItem(
            local_path=path,
            object_name=normalize_object_part(object_name, "object name"),
            size=path.stat().st_size,
            sha256=sha256_file(path),
            content_type=content_type_for(path),
            cache_control=cache_control_for(path),
        )
        for path, object_name in mappings
    ]


def gswitch_command(*gcloud_args: str) -> list[str]:
    return [
        "gswitch",
        "run",
        DEFAULT_ACCOUNT,
        "--",
        "gcloud",
        f"--project={DEFAULT_PROJECT}",
        *gcloud_args,
    ]


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def require_bucket_access() -> None:
    if shutil.which("gswitch") is None:
        raise PublishError("gswitch is not installed or not on PATH")
    result = run_command(
        gswitch_command(
            "storage",
            "buckets",
            "describe",
            f"gs://{DEFAULT_BUCKET}",
            "--format=value(name)",
        )
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise PublishError(f"cannot access destination bucket: {detail}")


def object_exists(object_name: str) -> bool:
    result = run_command(
        gswitch_command(
            "storage",
            "objects",
            "describe",
            f"gs://{DEFAULT_BUCKET}/{object_name}",
            "--format=value(name)",
        )
    )
    if result.returncode == 0:
        return True
    detail = f"{result.stdout}\n{result.stderr}".lower()
    not_found_markers = ("not found", "404", "matched no objects", "no urls matched")
    if any(marker in detail for marker in not_found_markers):
        return False
    raise PublishError(
        f"could not check destination object {object_name}: "
        f"{(result.stderr or result.stdout).strip()}"
    )


def preflight_collisions(items: list[UploadItem], overwrite: bool) -> None:
    if overwrite:
        return
    collisions = [item.object_name for item in items if object_exists(item.object_name)]
    if collisions:
        joined = "\n  ".join(collisions)
        raise PublishError(
            "destination objects already exist; choose another folder or obtain "
            f"confirmation to use --overwrite:\n  {joined}"
        )


def upload_item(item: UploadItem, overwrite: bool) -> None:
    command = gswitch_command(
        "storage",
        "cp",
        f"--content-type={item.content_type}",
        f"--cache-control={item.cache_control}",
    )
    if not overwrite:
        command.append("--no-clobber")
    command.extend(
        [str(item.local_path), f"gs://{DEFAULT_BUCKET}/{item.object_name}"]
    )
    result = run_command(command)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise PublishError(f"upload failed for {item.local_path}: {detail}")


def verify_item(item: UploadItem, attempts: int = 5) -> None:
    last_error = "unknown error"
    for attempt in range(attempts):
        try:
            request = Request(
                item.public_url,
                headers={"Cache-Control": "no-cache", "User-Agent": "personal-publisher/1"},
            )
            digest = hashlib.sha256()
            with urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise PublishError(f"HTTP {response.status}")
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != item.sha256:
                raise PublishError("public content hash does not match local file")
            return
        except (HTTPError, URLError, TimeoutError, PublishError) as exc:
            last_error = str(exc)
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise PublishError(f"anonymous verification failed for {item.public_url}: {last_error}")


def primary_item(items: list[UploadItem]) -> UploadItem:
    for item in items:
        if item.object_name.lower().endswith("/index.html"):
            return item
    return items[0]


def format_bytes(value: int) -> str:
    size = float(value)
    for unit in ("B", "KiB", "MiB", "GiB"):
        if size < 1024 or unit == "GiB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GiB"


def result_payload(
    args: argparse.Namespace, items: list[UploadItem], verified: bool
) -> dict[str, object]:
    primary = primary_item(items)
    return {
        "dry_run": args.dry_run,
        "verified": verified,
        "account": DEFAULT_ACCOUNT,
        "project": DEFAULT_PROJECT,
        "bucket": DEFAULT_BUCKET,
        "source": str(args.source.expanduser().resolve()),
        "file_count": len(items),
        "total_bytes": sum(item.size for item in items),
        "primary_url": primary.public_url,
        "files": [
            {
                "local_path": str(item.local_path),
                "object_name": item.object_name,
                "size": item.size,
                "sha256": item.sha256,
                "content_type": item.content_type,
                "cache_control": item.cache_control,
                "canonical_url": item.canonical_url,
                "public_url": item.public_url,
            }
            for item in items
        ],
    }


def print_human(args: argparse.Namespace, items: list[UploadItem], verified: bool) -> None:
    total = sum(item.size for item in items)
    action = "Would publish" if args.dry_run else "Published"
    print(f"{action} {len(items)} file(s), {format_bytes(total)} total:")
    for item in items:
        print(f"- {item.local_path} -> gs://{DEFAULT_BUCKET}/{item.object_name}")
        print(f"  {item.public_url}")
    print(f"Primary URL: {primary_item(items).public_url}")
    if verified:
        print("Verification: anonymous HTTP content matched every local SHA-256 hash")


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv if argv is not None else sys.argv[1:])
        items = build_plan(args)
        verified = False
        if not args.dry_run:
            require_bucket_access()
            preflight_collisions(items, args.overwrite)
            for item in items:
                upload_item(item, args.overwrite)
                verify_item(item)
            verified = True
        payload = result_payload(args, items, verified)
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            print_human(args, items, verified)
        return 0
    except PublishError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
