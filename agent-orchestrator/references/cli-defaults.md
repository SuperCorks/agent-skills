# CLI Defaults And Commands

Verified against official Codex and Claude Code documentation on 2026-06-27.

## Default Models And Reasoning

User policy for this skill:

- Codex model: `gpt-5.5`
- Codex reasoning: `xhigh` via `-c model_reasoning_effort="xhigh"`
- Claude model: `claude-opus-4-8`
- Claude effort: `xhigh`
- Codex autonomy: `--yolo`
- Claude autonomy: `--permission-mode bypassPermissions` and `--dangerously-skip-permissions`

Override for a single run:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine codex --model gpt-5.5 --reasoning xhigh --prompt "..."
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --model claude-opus-4-8 --reasoning xhigh --prompt "..."
```

Override by environment:

```bash
export AGENT_ORCHESTRATOR_CODEX_MODEL=gpt-5.5
export AGENT_ORCHESTRATOR_CODEX_REASONING=xhigh
export AGENT_ORCHESTRATOR_CLAUDE_MODEL=claude-opus-4-8
export AGENT_ORCHESTRATOR_CLAUDE_REASONING=xhigh
export AGENT_ORCHESTRATOR_RUN_TIMEOUT=1800
```

Claude Code accepts aliases such as `opus` and full model names. The skill default pins Opus 4.8 with the full model name `claude-opus-4-8`; if a local CLI reports `model_not_found`, rerun with the current official alias or full model ID using `--model`.

## Install Commands

The helper's default installer is `auto`, which prefers official native installers on macOS/Linux and then tries other documented global install paths if the first attempt leaves a missing or broken executable on `PATH`.

Native installers:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
curl -fsSL https://claude.ai/install.sh | bash
```

npm global installers:

```bash
npm install -g @openai/codex@latest
npm install -g @anthropic-ai/claude-code@latest
```

Homebrew installers:

```bash
brew install --cask codex
brew install --cask claude-code
```

Use the helper:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer npm
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer homebrew
```

## Authentication Commands

Preflight checks:

```bash
codex login status
claude auth status --text
```

Interactive login handoff:

```bash
codex login
claude auth login
```

Claude Console login:

```bash
claude auth login --console
```

If auth cannot complete from the current terminal, hand these exact commands to the user and ask them to complete the browser or device-code flow.

## Run Commands

Codex awaited worker:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine codex --timeout 1800 --prompt "Prompt..."
```

The helper builds:

```bash
codex exec --json --output-last-message /path/to/final.txt --model gpt-5.5 -c 'model_reasoning_effort="xhigh"' --cd /path/to/repo --yolo "Prompt..."
```

Claude awaited worker:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --timeout 1800 --prompt "Prompt..."
```

The helper builds:

```bash
claude -p --output-format json --model claude-opus-4-8 --effort xhigh --permission-mode bypassPermissions --dangerously-skip-permissions "Prompt..."
```

Resume examples:

```bash
codex exec --json --model gpt-5.5 -c 'model_reasoning_effort="xhigh"' --cd /path/to/repo --yolo resume SESSION_ID "Follow-up prompt..."
claude -p --output-format json --model claude-opus-4-8 --effort xhigh --permission-mode bypassPermissions --dangerously-skip-permissions --resume SESSION_ID "Follow-up prompt..."
```

## Output Artifacts

Each helper run writes:

- `manifest.json`: engine, model, reasoning, cwd, command, timing, exit code, and output paths.
- `prompt.txt`: the exact prompt sent to the worker.
- `stdout.txt`: raw stdout.
- `stderr.txt`: raw stderr.
- `final.txt`: best-effort extracted final text.
- `command.txt`: shell-quoted command for replay/debugging.

Read the manifest first, then inspect stdout/stderr as needed.
