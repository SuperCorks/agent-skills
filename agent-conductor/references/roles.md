# Worker roles

Every worker is a sub-agent definition installed from the `supercorks/subagents` repository. The Claude Code and Codex names differ only in separator.

| Role | Claude Code type | Codex `agent_type` | Model, effort | Writes | Never |
| --- | --- | --- | --- | --- | --- |
| implement | `conductor-implementer` | `conductor_implementer` | Opus 5 / Sol, high | code within its scope, its report | commits unless the packet's policy says so; worktrees; sub-agents |
| review | `conductor-reviewer` | `conductor_reviewer` | Opus 5 / Sol, high | `tasks/<id>-<slug>.review.md`, `accepted`/`rejected` event | code changes |
| explore | `conductor-explorer` | `conductor_explorer` | Opus 5 / Sol, high | a brief at the path you give it | edits |
| monitor | `conductor-monitor` | `conductor_monitor` | Sonnet / Luna, medium | `progress`/`blocked`/`done` events for an external process (CI, deploy, long build) | code changes, retries beyond its packet |
| computer-use | via `agent-orchestrator` (`--model astra`) | `conductor_computer_use` | GPT-6 Astra, medium | its report, browser/desktop actions within scope | purchases, deletions, or credential handling outside `web-computer-use` rules |
| integrate | `conductor-implementer` | `conductor_implementer` | Opus 5 / Sol, high | merged working branch, its report | force pushes |

## Prompts

Workers are prompted with a pointer, never with the task text, so the packet on disk stays the single source of truth. For Codex, append the parent's canonical agent path and native notification instruction from [codex.md](codex.md); this delivery metadata is needed even for explorers and reviewers.

- implement, integrate, computer-use: `Read <packet path> and follow it exactly.`
- review: `Review task <id> of run <run-id>: read <packet path> and <report path>, then follow the reviewer role.`
- explore: `Answer this for run <run-id> and write the brief to <run dir>/briefs/<topic>.md, under 150 lines: <question>. Include file paths with line numbers and stop when the question is answered.`
- monitor: a packet with role `monitor` whose objective names the process, the success and failure signals, and the maximum watch time.

## Result delivery

Write the report, review, or brief before recording its actionable event. In Codex, send the parent one concise native message with the run, task, result kind, and artifact path, then return the result as the final response. This includes `blocked` and `failed`, and reviewer `accepted` and `rejected` verdicts. `conductor.py event` persists state; it does not send a native notification. If native messaging is unavailable, finish the worker turn immediately so the parent can receive its completion. Do not wait for a timer or an acknowledgement after reporting a terminal result.

## Packet quality checklist

Before launching, confirm the packet has: a concrete objective with paths; owned files that do not overlap any other running task; acceptance criteria a reviewer can verify by running something or observing something; the project's real verification commands (read `package.json`, `Makefile`, or the repo instructions once, do not guess); an explicit commit policy; and the working directory that matches the recorded worktree.
