#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import stat
import sys
from pathlib import Path


COMMAND_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EXECUTABLE_TEMPLATES = {
    Path("bin/provider-cli"),
    Path("bin/provider-cli-host"),
    Path("install-host-command.sh"),
    Path("post-create.sh"),
    Path("post-start.sh"),
    Path("tests/provider-cli.test.sh"),
}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("project name must contain at least one letter or digit")
    return slug


def output_relative_path(template_path: Path, command: str) -> Path:
    replacements = {
        Path("gitignore.template"): Path(".gitignore"),
        Path("bin/provider-cli"): Path("bin") / command,
        Path("bin/provider-cli-host"): Path("bin") / f"{command}-host",
        Path("tests/provider-cli.test.sh"): Path("tests") / f"{command}.test.sh",
    }
    return replacements.get(template_path, template_path)


def render_scaffold(
    *,
    project_root: Path,
    project_name: str,
    project_slug: str,
    command: str,
    dry_run: bool,
) -> list[Path]:
    skill_root = Path(__file__).resolve().parent.parent
    scaffold_root = skill_root / "assets" / "scaffold"
    destination_root = project_root / ".devcontainer"

    if destination_root.exists():
        raise FileExistsError(
            f"{destination_root} already exists; inspect and merge manually"
        )

    placeholders = {
        "__PROJECT_NAME__": project_name,
        "__PROJECT_SLUG__": project_slug,
        "__COMMAND_NAME__": command,
        "__WORKSPACE_DIR__": f"/workspaces/{project_slug}",
        "__CONFIG_VOLUME__": f"{project_slug}-provider-cli-config",
    }

    rendered_paths: list[Path] = []
    for source in sorted(path for path in scaffold_root.rglob("*") if path.is_file()):
        relative_template = source.relative_to(scaffold_root)
        relative_output = output_relative_path(relative_template, command)
        destination = destination_root / relative_output
        rendered_paths.append(destination)

        if dry_run:
            continue

        content = source.read_text(encoding="utf-8")
        for placeholder, value in placeholders.items():
            content = content.replace(placeholder, value)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")

        if relative_template in EXECUTABLE_TEMPLATES:
            destination.chmod(destination.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return rendered_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a narrow, ephemeral provider CLI Dev Container scaffold."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Destination project root (default: current directory).",
    )
    parser.add_argument("--project-name", required=True, help="Human-facing project name.")
    parser.add_argument(
        "--project-slug",
        help="Lowercase project slug (default: derived from project name).",
    )
    parser.add_argument(
        "--command",
        help="Host command name (default: <project-slug>-dev).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List output files without creating them.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = args.project_root.expanduser().resolve()
    if not project_root.is_dir():
        print(f"Project root is not a directory: {project_root}", file=sys.stderr)
        return 2

    try:
        project_slug = args.project_slug or slugify(args.project_name)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    command = args.command or f"{project_slug}-dev"
    if not COMMAND_PATTERN.fullmatch(project_slug):
        print("Project slug must use lowercase letters, digits, and hyphens.", file=sys.stderr)
        return 2
    if not COMMAND_PATTERN.fullmatch(command):
        print("Command must use lowercase letters, digits, and hyphens.", file=sys.stderr)
        return 2

    try:
        rendered = render_scaffold(
            project_root=project_root,
            project_name=args.project_name,
            project_slug=project_slug,
            command=command,
            dry_run=args.dry_run,
        )
    except FileExistsError as error:
        print(str(error), file=sys.stderr)
        return 1

    action = "Would create" if args.dry_run else "Created"
    print(f"{action} provider CLI scaffold for {args.project_name}:")
    for path in rendered:
        print(f"  {path}")

    if not args.dry_run:
        print()
        print("Next:")
        print("  1. Remove unused providers and set target guards in devcontainer.json.")
        print("  2. Review CLI pins and checksums in Dockerfile.")
        print(f"  3. Run: bash .devcontainer/tests/{command}.test.sh")
        print("  4. Build the Dev Container, install the host command, and run doctor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
