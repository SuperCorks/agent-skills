---
name: agent-orchestrator
description: Launch and coordinate awaited Codex CLI or Claude Code CLI worker sessions from the current agent thread, including tool setup, authentication handoff, default high-autonomy flags, structured prompts, run capture, and result integration.
---

# Agent Orchestrator

## Overview

Use this skill when the current agent needs help from one or more external coding-agent CLI sessions while keeping the current thread as the accountable lead. It provides a disciplined workflow plus a local helper script for Codex CLI and Claude Code CLI runs that are awaited, captured, and easy to integrate.

This skill does not make background agents the default. Start commands that can be awaited, do not create worktrees unless the user explicitly instructs otherwise, and keep the current thread responsible for final judgment.

## Quick Start

Use the helper script for setup and runs:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py preflight --json
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine codex --cwd "$PWD" --timeout 1800 --prompt "Investigate the failing test and return a handoff packet."
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --cwd "$PWD" --timeout 1800 --prompt "Review this implementation for correctness risks and return a handoff packet."
```

Default worker settings are:

- Codex: `codex exec --model gpt-5.5 -c model_reasoning_effort="xhigh" --yolo`
- Claude Code: `claude -p --model claude-opus-4-8 --effort xhigh --permission-mode bypassPermissions --dangerously-skip-permissions`
- Runs are awaited and captured under `.agent-orchestrator/runs/` unless `--out-dir` is provided.
- Runs default to a 30-minute timeout; pass `--timeout 0` only when the user explicitly wants no ceiling.
- No worktrees are used unless the user asks for them.

## When To Use

Use orchestration when parallel or second-opinion work is likely to reduce risk or wall-clock time:

- Deep codebase investigation where another agent can trace an area while the lead reads another.
- Independent review of a patch, migration, security-sensitive change, or ambiguous failure.
- Research tasks where Codex and Claude may produce meaningfully different interpretations.
- Long-running implementation subtasks that can be bounded by a clear prompt and a clear expected handoff.

Avoid orchestration when the task is small, when a normal local command is enough, when the extra worker would need excessive hidden context, or when the user asked for the current agent only.

## Required Workflow

1. Read the references for the current task:
   - `references/orchestration-policy.md` for delegation and loop rules.
   - `references/cli-defaults.md` for CLI flags, setup, auth, and overrides.
2. Run preflight before the first worker run in a thread:

   ```bash
   python3 agent-orchestrator/scripts/agent_orchestrator.py preflight --json
   ```

3. If Codex or Claude is missing, broken, or unauthenticated, run setup:

   ```bash
   python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both
   ```

   If login requires the user, hand off the exact command printed by setup. Do not invent credentials, tokens, or browser completion steps.

4. Write a bounded worker prompt with:
   - Goal and non-goals.
   - Current working directory.
   - Constraints from the user, especially no worktrees unless explicitly requested.
   - Expected output: summary, evidence, files touched, verification, blockers, and next recommendation.

5. Launch the worker through `run`. Await completion before using the result.
6. Inspect the run manifest plus stdout/stderr. Do not blindly trust the worker. Reconcile the result with local evidence.
7. Integrate the useful parts into the current thread's answer or implementation. The current agent remains accountable for verification.

## Choosing Codex Or Claude

Prefer Codex for implementation inside repositories, OpenAI/Codex-specific behavior, tasks where the current Codex configuration matters, and worker runs that should mirror this environment.

Prefer Claude for an independent implementation plan, code review, UX/product critique, broad synthesis, or when a different model family is valuable.

Use both only when the work benefits from independent perspectives. Keep each worker prompt smaller than the whole user request; split by responsibility rather than asking two agents to do the same vague thing.

## Setup And Authentication

The helper supports:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine codex
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine claude
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer npm
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer native
```

Use `setup` when:

- `codex` or `claude` is not found on `PATH`.
- `codex --version` or `claude --version` fails.
- `codex login status` or `claude auth status` shows missing credentials.

If the setup script reports `auth_handoff_required`, give the user the exact command it prints, such as `codex login` or `claude auth login`, and ask them to complete it in their terminal/browser. After they finish, rerun `preflight`.

## Running Workers

Common examples:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run \
  --engine codex \
  --cwd "$PWD" \
  --name failing-test-investigation \
  --timeout 1800 \
  --prompt "Find the root cause of the failing auth test. Do not edit files. Return evidence and a recommended fix."
```

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run \
  --engine claude \
  --cwd "$PWD" \
  --name patch-review \
  --timeout 1800 \
  --prompt "Review the current git diff for correctness regressions. Do not edit files. Return findings with file and line references."
```

Useful options:

- `--dry-run`: print the command that would run.
- `--no-yolo`: disable `--yolo`/`bypassPermissions` for this run when the user asks for safer permissions.
- `--model`: override the default model.
- `--reasoning`: override Codex `model_reasoning_effort` or Claude `--effort`.
- `--resume SESSION_ID`: resume an existing CLI session instead of starting a fresh one.
- `--timeout SECONDS`: kill the worker after a ceiling; defaults to 1800, and `0` waits indefinitely.
- `--raw-prompt`: skip the skill's appended handoff instructions.
- `--extra-arg ARG`: pass an additional CLI argument. Use only for explicit user-requested CLI flags; with `--no-yolo`, permission-bypass flags are rejected.

## Handoff Contract

Every worker should return enough context for the lead to act without replaying the whole session:

- Final answer or recommendation.
- Files read or changed.
- Commands run and whether they passed.
- Evidence for claims, especially file paths and line numbers.
- Open questions, blockers, or assumptions.
- Suggested next action.

If the worker changed files, the lead must inspect the diff and run appropriate verification before presenting the result.

## Guardrails

- Keep delegation bounded. Do not create unbounded agent loops.
- Do not run worker sessions in the background by default.
- Do not use git worktrees unless the user explicitly asks.
- Do not pass secrets in prompts. Let CLIs use their own authenticated environments.
- Do not ask a worker to make commits, branches, PRs, or destructive changes unless the user requested that exact outcome.
- Stop after a small number of retries. If two worker attempts fail for the same environmental reason, report the blocker and the exact recovery command.

## References

- `references/orchestration-policy.md`
- `references/cli-defaults.md`
- Helper: `scripts/agent_orchestrator.py`
