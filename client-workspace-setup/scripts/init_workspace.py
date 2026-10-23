#!/usr/bin/env python3
"""Render the client workspace scaffold into a new workspace root.

Writes AGENTS.md, CLAUDE.md, README.md, repos.yaml, .gitignore, .ai-memory.toml,
scripts/, tests/ and the validation workflow. Refuses to overwrite existing files.
The rendered AGENTS.md and README.md contain TODO(setup) markers that
validate-workspace.sh rejects until they are filled in or deleted.
"""

from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SCAFFOLD = SKILL_DIR / "assets" / "workspace-scaffold"

# scaffold path -> output path
FILES = {
    "AGENTS.md": "AGENTS.md",
    "CLAUDE.md": "CLAUDE.md",
    "README.md": "README.md",
    "gitignore.template": ".gitignore",
    ".ai-memory.toml": ".ai-memory.toml",
    "scripts/bootstrap.sh": "scripts/bootstrap.sh",
    "scripts/validate-workspace.sh": "scripts/validate-workspace.sh",
    "tests/bootstrap.sh": "tests/bootstrap.sh",
    ".github/workflows/validate-workspace.yml": ".github/workflows/validate-workspace.yml",
}
EXECUTABLE = {"scripts/bootstrap.sh", "scripts/validate-workspace.sh", "tests/bootstrap.sh"}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
GITHUB_URL_RE = re.compile(r"^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")


def parse_repo(value: str) -> dict[str, str]:
    parts = [p.strip() for p in value.split("|")]
    if len(parts) != 4 or not all(parts[:3]):
        raise argparse.ArgumentTypeError(
            f"--repo must be 'folder|url|branch|description', got: {value!r}"
        )
    folder, url, branch, description = parts
    match = GITHUB_URL_RE.match(url)
    if not match:
        raise argparse.ArgumentTypeError(f"--repo url must be a GitHub https URL: {url!r}")
    if "/" in folder or folder.startswith("."):
        raise argparse.ArgumentTypeError(f"--repo folder must be a top-level name: {folder!r}")
    return {
        "name": match.group(2),
        "owner": match.group(1),
        "folder": folder,
        "url": url,
        "branch": branch,
        "description": description or folder,
    }


def yaml_quote(value: str) -> str:
    if re.search(r"[:#\[\]{}&*!|>'\"%@`,]", value) or value != value.strip():
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


def render_repos_yaml(org: str, workspace_url: str, repos: list[dict[str, str]]) -> str:
    lines = [
        'version: "1.0"',
        "",
        f"organization: {yaml_quote(org)}",
        f"workspace_repository: {workspace_url}",
        "",
        "repositories:",
    ]
    for i, repo in enumerate(repos):
        if i:
            lines.append("")
        lines += [
            f"  - name: {yaml_quote(repo['name'])}",
            f"    folder: {yaml_quote(repo['folder'])}",
            f"    url: {repo['url']}",
            f"    branch: {yaml_quote(repo['branch'])}",
            f"    description: {yaml_quote(repo['description'])}",
        ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="Absolute path of the workspace root to create or fill")
    parser.add_argument("--client-name", required=True, help='Display name, e.g. "Acme Health"')
    parser.add_argument("--slug", required=True, help="Lowercase slug, e.g. acme-health")
    parser.add_argument("--github-org", required=True, help="GitHub org that owns the child repos")
    parser.add_argument("--workspace-repo-url", required=True, help="https://github.com/<owner>/<slug>-workspace.git")
    parser.add_argument("--mac-path", required=True, help="Display path on the MacBook, e.g. ~/redkrypton/projects/acme-health")
    parser.add_argument("--remote-path", help="Path on the remote host (default /workspaces/<slug>)")
    parser.add_argument("--chrome-profile", required=True, help="Chrome profile display name")
    parser.add_argument("--ai-memory-workspace", required=True, help='ai-memory workspace scope, e.g. "redkrypton/acme-health"')
    parser.add_argument("--ownership-sentence", required=True,
                        help='First README sentence, e.g. "This is Red Krypton\'s meta-repository for Acme Health work."')
    parser.add_argument("--intro", required=True, help="One- or two-sentence AGENTS.md intro (who owns the code, how we contribute)")
    parser.add_argument("--gateway-command", help="Gateway command if it lives at this workspace root (adds its test to CI)")
    parser.add_argument("--repo", action="append", type=parse_repo, required=True,
                        help="Child repo as 'folder|url|branch|description' (repeat)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_absolute():
        parser.error("--root must be absolute")
    if not SLUG_RE.match(args.slug):
        parser.error("--slug must be lowercase letters, digits and hyphens")
    ws_match = GITHUB_URL_RE.match(args.workspace_repo_url)
    if not ws_match:
        parser.error("--workspace-repo-url must be a GitHub https URL")
    folders = [r["folder"] for r in args.repo]
    if len(set(folders)) != len(folders):
        parser.error("duplicate --repo folder")

    gateway_step = ""
    if args.gateway_command:
        gateway_step = (
            "      - name: Test provider CLI gateway\n"
            f"        run: bash .devcontainer/tests/{args.gateway_command}.test.sh\n"
        )

    tokens = {
        "CLIENT_NAME": args.client_name,
        "SLUG": args.slug,
        "GITHUB_ORG": args.github_org,
        "WORKSPACE_REPO_URL": args.workspace_repo_url,
        "WORKSPACE_REPO_SLUG": f"{ws_match.group(1)}/{ws_match.group(2)}",
        "MAC_PATH": args.mac_path,
        "REMOTE_PATH": args.remote_path or f"/workspaces/{args.slug}",
        "CHROME_PROFILE": args.chrome_profile,
        "AI_MEMORY_WORKSPACE": args.ai_memory_workspace,
        "OWNERSHIP_SENTENCE": args.ownership_sentence,
        "AGENTS_INTRO": args.intro,
        "GATEWAY_CI_STEP": gateway_step,
        "CHILD_IGNORES": "\n".join(f"/{f}" for f in folders),
        "CHILD_LIST_INLINE": ", ".join(f"`./{f}`" for f in folders),
        "AGENTS_REPO_BULLETS": "\n".join(f"- `{r['folder']}/`: {r['description']}" for r in args.repo),
        "README_REPO_ROWS": "\n".join(
            f"| `{r['folder']}` | [{r['owner']}/{r['name']}]({r['url']}) | `{r['branch']}` | {r['description']} |"
            for r in args.repo
        ),
    }

    outputs: dict[str, str] = {}
    for src, dest in FILES.items():
        text = (SCAFFOLD / src).read_text()
        for key, value in tokens.items():
            text = text.replace("{{" + key + "}}", value)
        leftover = re.findall(r"\{\{[A-Z_]+\}\}", text)
        if leftover:
            print(f"error: unrendered tokens in {dest}: {sorted(set(leftover))}", file=sys.stderr)
            return 1
        outputs[dest] = text
    outputs["repos.yaml"] = render_repos_yaml(args.github_org, args.workspace_repo_url, args.repo)

    existing = [d for d in outputs if (root / d).exists()]
    if existing:
        print("error: refusing to overwrite existing files:\n  " + "\n  ".join(existing), file=sys.stderr)
        return 1

    for dest, text in outputs.items():
        path = root / dest
        if args.dry_run:
            print(f"would write {path}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        if dest in EXECUTABLE:
            path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"wrote {path}")

    if not args.dry_run:
        print("\nNext: fill or delete every TODO(setup) block in AGENTS.md and README.md, then run "
              "./scripts/validate-workspace.sh and ./tests/bootstrap.sh.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
