# CLI Defaults And Commands

Verified against official Codex and Claude Code documentation on 2026-06-27. OpenCode/OpenRouter GLM 5.2 behavior was verified locally on 2026-06-30.

## Default Models And Reasoning

User policy for this skill:

- Codex model: `gpt-5.5`
- Codex reasoning: `xhigh` via `-c model_reasoning_effort="xhigh"`
- Claude model: `claude-opus-4-8`
- Claude effort: `xhigh`
- Claude Fable 5 model: `claude-fable-5` or Claude Code alias `fable`
- Claude Fable 5 effort: `high` unless overridden with `--reasoning`
- OpenCode model: `openrouter/z-ai/glm-5.2`
- OpenCode variant: `xhigh`
- Codex autonomy: `--yolo`
- Claude autonomy: `--permission-mode bypassPermissions` and `--dangerously-skip-permissions`
- OpenCode autonomy: `--auto` when supported, plus local config `permission: "allow"` for unattended tool use

Override for a single run:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine codex --model gpt-5.5 --reasoning xhigh --prompt "..."
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --model claude-opus-4-8 --reasoning xhigh --prompt "..."
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --model claude-fable-5 --prompt "..."
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine opencode --model openrouter/z-ai/glm-5.2 --reasoning xhigh --prompt "..."
```

Override by environment:

```bash
export AGENT_ORCHESTRATOR_CODEX_MODEL=gpt-5.5
export AGENT_ORCHESTRATOR_CODEX_REASONING=xhigh
export AGENT_ORCHESTRATOR_CLAUDE_MODEL=claude-opus-4-8
export AGENT_ORCHESTRATOR_CLAUDE_REASONING=xhigh
export AGENT_ORCHESTRATOR_CLAUDE_FABLE_REASONING=high
export AGENT_ORCHESTRATOR_OPENCODE_MODEL=openrouter/z-ai/glm-5.2
export AGENT_ORCHESTRATOR_OPENCODE_REASONING=xhigh
export AGENT_ORCHESTRATOR_OPENCODE_AUTH_PROVIDER=OpenRouter
export AGENT_ORCHESTRATOR_RUN_TIMEOUT=1800
```

Claude Code accepts aliases such as `opus`, `fable`, and full model names. The skill default pins Opus 4.8 with the full model name `claude-opus-4-8`; if a local CLI reports `model_not_found`, rerun with the current official alias or full model ID using `--model`.

Claude Fable 5 is available as `claude-fable-5` and Claude Code alias `fable`. It is not the default model. When selected and `--reasoning` is omitted, the helper uses `high` effort by default. Set `--reasoning xhigh` or `--reasoning max` only when the task warrants higher token spend, or change `AGENT_ORCHESTRATOR_CLAUDE_FABLE_REASONING` for a different local default.

OpenCode expects model IDs in provider/model form. The GLM 5.2 OpenRouter route is `openrouter/z-ai/glm-5.2`; the helper sends `--variant xhigh` by default and stores OpenCode's JSON event stream in the run artifacts. Newer OpenCode builds document `opencode run --auto` for unattended operation; the helper adds `--auto` when the installed CLI exposes it and otherwise relies on OpenCode config `permission: "allow"`.

Recommended local OpenCode config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/z-ai/glm-5.2",
  "permission": "allow",
  "autoupdate": true
}
```

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
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine opencode
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer npm
python3 agent-orchestrator/scripts/agent_orchestrator.py setup --engine both --installer homebrew
```

The helper checks OpenCode readiness but does not install OpenCode automatically. If `opencode` is missing, install it through the user's chosen OpenCode distribution path and rerun preflight.

## Authentication Commands

Preflight checks:

```bash
codex login status
claude auth status --text
opencode auth list
```

Interactive login handoff:

```bash
codex login
claude auth login
opencode auth login openrouter
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

Claude Fable 5 awaited worker:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine claude --model claude-fable-5 --timeout 1800 --prompt "Prompt..."
```

The helper builds:

```bash
claude -p --output-format json --model claude-fable-5 --effort high --permission-mode bypassPermissions --dangerously-skip-permissions "Prompt..."
```

OpenCode awaited worker using GLM 5.2 through OpenRouter:

```bash
python3 agent-orchestrator/scripts/agent_orchestrator.py run --engine opencode --timeout 1800 --prompt "Prompt..."
```

The helper builds:

```bash
opencode run --auto --format json --model openrouter/z-ai/glm-5.2 --variant xhigh "Prompt..."
```

If the installed `opencode run --help` does not list `--auto`, the helper omits that flag and expects `permission: "allow"` in config for yolo-equivalent behavior.

Resume examples:

```bash
codex exec --json --model gpt-5.5 -c 'model_reasoning_effort="xhigh"' --cd /path/to/repo --yolo resume SESSION_ID "Follow-up prompt..."
claude -p --output-format json --model claude-opus-4-8 --effort xhigh --permission-mode bypassPermissions --dangerously-skip-permissions --resume SESSION_ID "Follow-up prompt..."
opencode run --auto --format json --model openrouter/z-ai/glm-5.2 --variant xhigh --session SESSION_ID "Follow-up prompt..."
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
