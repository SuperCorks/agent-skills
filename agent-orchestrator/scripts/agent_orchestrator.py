#!/usr/bin/env python3
"""Run awaited Codex, Claude Code, or OpenCode worker sessions with captured handoff output."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_CODEX_MODEL = os.environ.get("AGENT_ORCHESTRATOR_CODEX_MODEL", "gpt-5.5")
DEFAULT_CODEX_REASONING = os.environ.get("AGENT_ORCHESTRATOR_CODEX_REASONING", "xhigh")
DEFAULT_CLAUDE_MODEL = os.environ.get("AGENT_ORCHESTRATOR_CLAUDE_MODEL", "claude-opus-4-8")
DEFAULT_CLAUDE_REASONING = os.environ.get("AGENT_ORCHESTRATOR_CLAUDE_REASONING", "xhigh")
DEFAULT_CLAUDE_FABLE_REASONING = os.environ.get("AGENT_ORCHESTRATOR_CLAUDE_FABLE_REASONING", "high")
DEFAULT_OPENCODE_MODEL = os.environ.get("AGENT_ORCHESTRATOR_OPENCODE_MODEL", "openrouter/z-ai/glm-5.2")
DEFAULT_OPENCODE_REASONING = os.environ.get("AGENT_ORCHESTRATOR_OPENCODE_REASONING", "xhigh")
OPENCODE_AUTH_PROVIDER = os.environ.get("AGENT_ORCHESTRATOR_OPENCODE_AUTH_PROVIDER", "OpenRouter")
CLAUDE_FABLE_MODELS = {"fable", "claude-fable-5"}
DEFAULT_RUN_TIMEOUT = int(os.environ.get("AGENT_ORCHESTRATOR_RUN_TIMEOUT", "1800"))
DEFAULT_RUN_ROOT = Path(".agent-orchestrator") / "runs"
DANGEROUS_EXTRA_ARGS = {
    "--auto",
    "--dangerously-bypass-approvals-and-sandbox",
    "--dangerously-skip-permissions",
    "--permission-mode",
    "--yolo",
}
_OPENCODE_AUTO_SUPPORTED: bool | None = None

HANDOFF_SUFFIX = """\

---
Worker handoff requirements:
- Do not create git worktrees unless explicitly requested.
- Do not start background sessions.
- Preserve unrelated user changes.
- End with: Summary, Evidence, Files changed, Commands run, Blockers/assumptions, Recommended next step.
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip()).strip("-_")
    return slug or "worker-run"


def timeout_value(seconds: int | None) -> int | None:
    if seconds is None or seconds <= 0:
        return None
    return seconds


def run_quiet(command: list[str], timeout: int = 30) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return {
            "command": command,
            "exit_code": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except FileNotFoundError as exc:
        return {"command": command, "exit_code": 127, "stdout": "", "stderr": str(exc)}
    except subprocess.TimeoutExpired as exc:
        return {
            "command": command,
            "exit_code": 124,
            "stdout": (exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "").strip() if isinstance(exc.stderr, str) else "timed out",
        }


def selected_engines(value: str) -> list[str]:
    if value == "both":
        return ["codex", "claude"]
    if value == "all":
        return ["codex", "claude", "opencode"]
    return [value]


def executable_name(engine: str) -> str:
    if engine == "claude":
        return "claude"
    if engine == "opencode":
        return "opencode"
    return "codex"


def default_model(engine: str) -> str:
    if engine == "claude":
        return DEFAULT_CLAUDE_MODEL
    if engine == "opencode":
        return DEFAULT_OPENCODE_MODEL
    return DEFAULT_CODEX_MODEL


def default_reasoning(engine: str, model: str | None = None) -> str:
    if engine == "claude":
        if (model or DEFAULT_CLAUDE_MODEL).lower() in CLAUDE_FABLE_MODELS:
            return DEFAULT_CLAUDE_FABLE_REASONING
        return DEFAULT_CLAUDE_REASONING
    if engine == "opencode":
        return DEFAULT_OPENCODE_REASONING
    return DEFAULT_CODEX_REASONING


def authenticated(engine: str, auth: dict[str, Any] | None) -> bool:
    if not auth or auth["exit_code"] != 0:
        return False
    if engine != "opencode":
        return True
    return bool(re.search(rf"\b{re.escape(OPENCODE_AUTH_PROVIDER)}\b", auth.get("stdout", ""), re.IGNORECASE))


def explicit_permission_bypass_enabled(engine: str, no_yolo: bool) -> bool:
    return engine in {"codex", "claude", "opencode"} and not no_yolo


def opencode_auto_supported() -> bool:
    global _OPENCODE_AUTO_SUPPORTED
    if _OPENCODE_AUTO_SUPPORTED is None:
        help_result = run_quiet(["opencode", "run", "--help"])
        _OPENCODE_AUTO_SUPPORTED = help_result["exit_code"] == 0 and "--auto" in help_result["stdout"]
    return _OPENCODE_AUTO_SUPPORTED


def tool_state(engine: str) -> dict[str, Any]:
    executable = executable_name(engine)
    path = shutil.which(executable)
    version = None
    auth = None
    status = "missing"

    if path:
        version = run_quiet([executable, "--version"])
        if version["exit_code"] == 0:
            status = "ok"
            if engine == "codex":
                auth = run_quiet(["codex", "login", "status"])
            elif engine == "opencode":
                auth = run_quiet(["opencode", "auth", "list"])
            else:
                auth = run_quiet(["claude", "auth", "status", "--text"])
        else:
            status = "broken"

    return {
        "engine": engine,
        "executable": executable,
        "path": path,
        "status": status,
        "installed": bool(path) and status == "ok",
        "version": version,
        "authenticated": authenticated(engine, auth),
        "auth": auth,
    }


def install_command(engine: str, installer: str) -> tuple[str, list[str]] | None:
    if engine == "opencode":
        return None

    system = platform.system()
    if installer == "auto":
        if system in {"Darwin", "Linux"} and shutil.which("curl"):
            installer = "native"
        elif shutil.which("npm"):
            installer = "npm"
        elif system == "Darwin" and shutil.which("brew"):
            installer = "homebrew"
        else:
            installer = "native"

    if installer == "npm":
        if not shutil.which("npm"):
            return None
        package = "@openai/codex@latest" if engine == "codex" else "@anthropic-ai/claude-code@latest"
        return installer, ["npm", "install", "-g", package]

    if installer == "homebrew":
        if not shutil.which("brew"):
            return None
        cask = "codex" if engine == "codex" else "claude-code"
        return installer, ["brew", "install", "--cask", cask]

    if installer == "native":
        if system == "Windows":
            if engine == "codex":
                return installer, [
                    "powershell",
                    "-ExecutionPolicy",
                    "ByPass",
                    "-c",
                    "irm https://chatgpt.com/codex/install.ps1 | iex",
                ]
            return installer, [
                "powershell",
                "-ExecutionPolicy",
                "ByPass",
                "-c",
                "irm https://claude.ai/install.ps1 | iex",
            ]

        if not shutil.which("sh") or not shutil.which("curl"):
            return None
        if engine == "codex":
            return installer, [
                "sh",
                "-lc",
                "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh",
            ]
        if not shutil.which("bash"):
            return None
        return installer, ["sh", "-lc", "curl -fsSL https://claude.ai/install.sh | bash"]

    return None


def fallback_install_commands(engine: str, primary_method: str) -> list[tuple[str, list[str]]]:
    fallbacks: list[tuple[str, list[str]]] = []
    for method in ["npm", "homebrew", "native"]:
        if method == primary_method:
            continue
        chosen = install_command(engine, method)
        if chosen:
            fallbacks.append(chosen)
    return fallbacks


def login_command(engine: str, claude_console: bool = False) -> list[str]:
    if engine == "codex":
        return ["codex", "login"]
    if engine == "opencode":
        return ["opencode", "auth", "login", "openrouter"]
    if claude_console:
        return ["claude", "auth", "login", "--console"]
    return ["claude", "auth", "login"]


def print_payload(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    if "engines" in payload:
        for state in payload["engines"]:
            auth = "yes" if state.get("authenticated") else "no"
            print(f"{state['engine']}: {state['status']} auth={auth} path={state.get('path') or '-'}")
        return
    print(json.dumps(payload, indent=2, sort_keys=True))


def handle_preflight(args: argparse.Namespace) -> int:
    payload = {"engines": [tool_state(engine) for engine in selected_engines(args.engine)]}
    print_payload(payload, args.json)
    if any(state["status"] != "ok" or not state["authenticated"] for state in payload["engines"]):
        return 2
    return 0


def run_setup_command(command: list[str], capture: bool) -> dict[str, Any]:
    started = utc_now()
    if capture:
        result = run_quiet(command, timeout=1800)
    else:
        try:
            completed = subprocess.run(command, text=True, check=False)
            result = {"command": command, "exit_code": completed.returncode, "stdout": "", "stderr": ""}
        except FileNotFoundError as exc:
            result = {"command": command, "exit_code": 127, "stdout": "", "stderr": str(exc)}
    result["started_at"] = started
    result["ended_at"] = utc_now()
    return result


def handle_setup(args: argparse.Namespace) -> int:
    results: list[dict[str, Any]] = []
    exit_code = 0

    for engine in selected_engines(args.engine):
        item: dict[str, Any] = {"engine": engine, "before": tool_state(engine)}
        state = item["before"]

        if state["status"] != "ok" and not args.skip_install:
            chosen = install_command(engine, args.installer)
            if not chosen:
                item["install_error"] = f"Installer {args.installer} is not available on this machine."
                exit_code = 2
            else:
                method, command = chosen
                item["install_attempts"] = [
                    {
                        "method": method,
                        "result": run_setup_command(command, capture=args.json),
                    }
                ]
                state = tool_state(engine)

                if args.installer == "auto" and state["status"] != "ok":
                    for fallback_method, fallback_command in fallback_install_commands(engine, method):
                        item["install_attempts"].append(
                            {
                                "method": fallback_method,
                                "result": run_setup_command(fallback_command, capture=args.json),
                            }
                        )
                        state = tool_state(engine)
                        if state["status"] == "ok":
                            break

        item["after_install"] = state

        if state["status"] == "ok" and not args.skip_login:
            if state["authenticated"]:
                item["auth_status"] = "authenticated"
            else:
                command = login_command(engine, claude_console=args.claude_console)
                item["auth_handoff_command"] = shlex.join(command)
                if sys.stdin.isatty() and not args.json:
                    item["auth"] = run_setup_command(command, capture=False)
                    state = tool_state(engine)
                    item["after_auth"] = state
                    if state["authenticated"]:
                        item["auth_status"] = "authenticated"
                    else:
                        item["auth_status"] = "auth_handoff_required"
                        exit_code = 2
                else:
                    item["auth_status"] = "auth_handoff_required"
                    exit_code = 2
        elif state["status"] != "ok":
            exit_code = 2

        results.append(item)

    payload = {"results": results}
    print_payload(payload, args.json)
    return exit_code


def read_prompt(args: argparse.Namespace) -> str:
    chunks: list[str] = []
    if args.prompt:
        chunks.append(args.prompt)
    if args.prompt_file:
        chunks.append(Path(args.prompt_file).expanduser().read_text(encoding="utf-8"))
    if not sys.stdin.isatty():
        stdin_text = sys.stdin.read()
        if stdin_text.strip():
            chunks.append(stdin_text)
    prompt = "\n\n".join(chunk.strip() for chunk in chunks if chunk and chunk.strip())
    if not prompt:
        raise SystemExit("run requires --prompt, --prompt-file, or piped stdin")
    if args.raw_prompt:
        return prompt
    return prompt.rstrip() + HANDOFF_SUFFIX


def build_command(
    args: argparse.Namespace,
    cwd: Path,
    prompt: str,
    final_path: Path | None,
) -> list[str]:
    extra = args.extra_arg or []
    if args.no_yolo and any(arg in DANGEROUS_EXTRA_ARGS for arg in extra):
        raise SystemExit("--no-yolo cannot be combined with extra permission-bypass arguments")
    model = args.model
    reasoning = args.reasoning

    if args.engine == "codex":
        command = [
            "codex",
            "exec",
            "--json",
        ]
        if final_path is not None:
            command.extend(["--output-last-message", str(final_path)])
        command.extend(
            [
                "--model",
                model or DEFAULT_CODEX_MODEL,
                "-c",
                f'model_reasoning_effort="{reasoning or DEFAULT_CODEX_REASONING}"',
                "--cd",
                str(cwd),
            ]
        )
        if not args.no_yolo:
            command.append("--yolo")
        command.extend(extra)
        if args.resume:
            command.extend(["resume", args.resume])
        command.append(prompt)
        return command

    if args.engine == "opencode":
        command = [
            "opencode",
            "run",
        ]
        if not args.no_yolo and opencode_auto_supported():
            command.append("--auto")
        command.extend(
            [
                "--format",
                "json",
                "--model",
                model or DEFAULT_OPENCODE_MODEL,
            ]
        )
        variant = reasoning or DEFAULT_OPENCODE_REASONING
        if variant:
            command.extend(["--variant", variant])
        if args.resume:
            command.extend(["--session", args.resume])
        if args.name:
            command.extend(["--title", args.name])
        command.extend(extra)
        command.append(prompt)
        return command

    command = [
        "claude",
        "-p",
        "--output-format",
        "json",
        "--model",
        model or DEFAULT_CLAUDE_MODEL,
        "--effort",
        reasoning or default_reasoning("claude", model or DEFAULT_CLAUDE_MODEL),
    ]
    if not args.no_yolo:
        command.extend(["--permission-mode", "bypassPermissions", "--dangerously-skip-permissions"])
    if args.resume:
        command.extend(["--resume", args.resume])
    command.extend(extra)
    command.append(prompt)
    return command


def extract_final(engine: str, stdout: str, codex_final_path: Path) -> str:
    if engine == "codex":
        if codex_final_path.exists():
            return codex_final_path.read_text(encoding="utf-8", errors="replace").strip()
        if stdout.strip():
            return "Codex did not write the final message file. Inspect stdout.txt and stderr.txt for JSON events and errors."
        return ""

    if engine == "claude":
        try:
            payload = json.loads(stdout)
            if isinstance(payload, dict):
                if "result" in payload:
                    result = payload["result"]
                    return result if isinstance(result, str) else json.dumps(result, indent=2, sort_keys=True)
                if "structured_output" in payload:
                    result = payload["structured_output"]
                    return result if isinstance(result, str) else json.dumps(result, indent=2, sort_keys=True)
        except json.JSONDecodeError:
            pass

    if engine == "opencode":
        text_chunks: list[str] = []
        for line in stdout.splitlines():
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict) or payload.get("type") != "text":
                continue
            part = payload.get("part")
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                text_chunks.append(part["text"])
        if text_chunks:
            return "".join(text_chunks).strip()

    lines = [line for line in stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def make_run_dir(root: Path, engine: str, name: str | None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = slugify(name or engine)
    counter = 2
    run_dir = root / f"{stamp}-{suffix}-{engine}"
    while True:
        try:
            run_dir.mkdir(parents=True, exist_ok=False)
            return run_dir
        except FileExistsError:
            run_dir = root / f"{stamp}-{suffix}-{engine}-{counter}"
            counter += 1


def run_worker_command(command: list[str], cwd: Path, timeout_seconds: int | None) -> dict[str, Any]:
    process = None
    try:
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, stderr = process.communicate(timeout=timeout_value(timeout_seconds))
        return {
            "exit_code": process.returncode,
            "stdout": stdout or "",
            "stderr": stderr or "",
            "timed_out": False,
            "interrupted": False,
        }
    except subprocess.TimeoutExpired:
        if process is not None:
            process.kill()
            stdout, stderr = process.communicate()
        else:
            stdout, stderr = "", "timed out"
        return {
            "exit_code": 124,
            "stdout": stdout or "",
            "stderr": stderr or "timed out",
            "timed_out": True,
            "interrupted": False,
        }
    except KeyboardInterrupt:
        if process is not None:
            process.kill()
            stdout, stderr = process.communicate()
        else:
            stdout, stderr = "", "interrupted"
        return {
            "exit_code": 130,
            "stdout": stdout or "",
            "stderr": stderr or "interrupted",
            "timed_out": False,
            "interrupted": True,
        }
    except FileNotFoundError as exc:
        return {
            "exit_code": 127,
            "stdout": "",
            "stderr": str(exc),
            "timed_out": False,
            "interrupted": False,
        }


def handle_run(args: argparse.Namespace) -> int:
    cwd = Path(args.cwd).expanduser().resolve()
    if not cwd.exists() or not cwd.is_dir():
        raise SystemExit(f"cwd does not exist or is not a directory: {cwd}")

    prompt = read_prompt(args)
    dry_final = Path("<run-dir>") / "final.txt"
    dry_command = build_command(args, cwd, prompt, dry_final)
    if args.dry_run:
        payload = {
            "engine": args.engine,
            "cwd": str(cwd),
            "command": dry_command,
            "command_display": shlex.join(dry_command),
            "yolo_enabled": explicit_permission_bypass_enabled(args.engine, args.no_yolo),
        }
        print_payload(payload, args.json)
        return 0

    state = tool_state(args.engine)
    if state["status"] != "ok" or not state["authenticated"]:
        print_payload(
            {
                "error": "engine_not_ready",
                "engine": args.engine,
                "state": state,
                "suggested_command": f"{Path(__file__).name} setup --engine {args.engine}",
            },
            args.json,
        )
        return 2

    out_root = Path(args.out_dir).expanduser() if args.out_dir else cwd / DEFAULT_RUN_ROOT
    run_dir = make_run_dir(out_root, args.engine, args.name)
    stdout_path = run_dir / "stdout.txt"
    stderr_path = run_dir / "stderr.txt"
    prompt_path = run_dir / "prompt.txt"
    final_path = run_dir / "final.txt"
    command_path = run_dir / "command.txt"
    manifest_path = run_dir / "manifest.json"

    command = build_command(args, cwd, prompt, final_path if args.engine == "codex" else None)
    prompt_path.write_text(prompt, encoding="utf-8")
    command_path.write_text(shlex.join(command) + "\n", encoding="utf-8")

    started_at = utc_now()
    started = time.monotonic()
    run_result = run_worker_command(command, cwd, args.timeout)
    exit_code = int(run_result["exit_code"])
    stdout = str(run_result["stdout"])
    stderr = str(run_result["stderr"])
    timed_out = bool(run_result["timed_out"])
    interrupted = bool(run_result["interrupted"])

    ended_at = utc_now()
    duration_seconds = round(time.monotonic() - started, 3)
    stdout_path.write_text(stdout or "", encoding="utf-8")
    stderr_path.write_text(stderr or "", encoding="utf-8")

    final_text = extract_final(args.engine, stdout or "", final_path)
    if not final_path.exists() or args.engine != "codex":
        final_path.write_text(final_text + ("\n" if final_text else ""), encoding="utf-8")

    manifest = {
        "engine": args.engine,
        "cwd": str(cwd),
        "run_dir": str(run_dir),
        "model": args.model or default_model(args.engine),
        "reasoning": args.reasoning or default_reasoning(args.engine, args.model or default_model(args.engine)),
        "yolo_enabled": explicit_permission_bypass_enabled(args.engine, args.no_yolo),
        "resume": args.resume,
        "started_at": started_at,
        "ended_at": ended_at,
        "duration_seconds": duration_seconds,
        "timed_out": timed_out,
        "interrupted": interrupted,
        "exit_code": exit_code,
        "command": command,
        "command_display": shlex.join(command),
        "prompt_path": str(prompt_path),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "final_path": str(final_path),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    payload = {
        "run_dir": str(run_dir),
        "manifest_path": str(manifest_path),
        "exit_code": exit_code,
        "final_path": str(final_path),
        "final_preview": final_text[:1000],
    }
    print_payload(payload, args.json)
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    preflight = subparsers.add_parser("preflight", help="Check CLI installation and authentication.")
    preflight.add_argument("--engine", choices=["both", "all", "codex", "claude", "opencode"], default="both")
    preflight.add_argument("--json", action="store_true")
    preflight.set_defaults(func=handle_preflight)

    setup = subparsers.add_parser("setup", help="Install missing CLIs and start login handoff when needed.")
    setup.add_argument("--engine", choices=["both", "all", "codex", "claude", "opencode"], default="both")
    setup.add_argument("--installer", choices=["auto", "native", "npm", "homebrew"], default="auto")
    setup.add_argument("--skip-install", action="store_true")
    setup.add_argument("--skip-login", action="store_true")
    setup.add_argument("--claude-console", action="store_true", help="Use Claude Console auth instead of subscription auth.")
    setup.add_argument("--json", action="store_true")
    setup.set_defaults(func=handle_setup)

    run = subparsers.add_parser("run", help="Run one awaited worker session and capture its output.")
    run.add_argument("--engine", choices=["codex", "claude", "opencode"], required=True)
    run.add_argument("--cwd", default=os.getcwd())
    run.add_argument("--prompt")
    run.add_argument("--prompt-file")
    run.add_argument("--name")
    run.add_argument("--out-dir")
    run.add_argument("--model")
    run.add_argument("--reasoning")
    run.add_argument("--resume")
    run.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_RUN_TIMEOUT,
        help="Seconds before killing the worker; use 0 to wait indefinitely.",
    )
    run.add_argument("--extra-arg", action="append")
    run.add_argument("--raw-prompt", action="store_true")
    run.add_argument("--no-yolo", action="store_true")
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--json", action="store_true")
    run.set_defaults(func=handle_run)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
