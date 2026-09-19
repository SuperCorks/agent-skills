# Claude Code reference for the master

Use these exact mechanisms. Names are the tools Claude Code exposes to you; if one is deferred, load it with ToolSearch first.

## Preflight checks

- **Worker definitions**: `ls ~/.claude/agents ~/.claude_*/agents .claude/agents 2>/dev/null | grep -i conductor`. You need `Conductor Implementer`, `Conductor Reviewer`, `Conductor Explorer`, `Conductor Monitor`, and `Conductor Computer Use`. Their frontmatter pins `model: claude-opus-4-8` and `effort: xhigh` (monitor: `sonnet`, `medium`), which is the only way to guarantee effort per worker: the Agent tool has no per-launch effort parameter and would otherwise inherit the session's.
- **Fast mode**: fast mode is a session toggle (`/fast`) and a worker inherits it at spawn. You cannot toggle it yourself. If the session is in fast mode, ask the user to turn it off before you dispatch anything.
- **Effort**: if the definitions are missing and cannot be installed, the session itself must be at `xhigh` (`/effort xhigh`) so inherited effort matches; say so to the user.

## Launch a worker

Always background, always the definition's `subagent_type`, prompt only the packet pointer:

```
Agent(
  subagent_type: "conductor-implementer",
  model: "claude-opus-4-8",
  run_in_background: true,
  description: "Task 03 implement",
  prompt: "Read /Users/.../runs/<run-id>/tasks/03-<slug>.md and follow it exactly."
)
```

- Reviewer: `subagent_type: "conductor-reviewer"`, prompt `Review task 03 of run <run-id>: read <packet path> and <report path>, then follow the reviewer role.`
- Explorer: `subagent_type: "conductor-explorer"`, prompt a question plus the brief path to write.
- Monitor: `subagent_type: "conductor-monitor"`, `model: "sonnet"`.
- Computer use: not a Claude worker. Use the `agent-orchestrator` skill: `python3 <agent-orchestrator>/scripts/agent_orchestrator.py run --engine codex --model astra --cwd <dir> --timeout 2700 --prompt "Read <packet path> and follow it exactly."` That call is awaited; run it from a background Bash command so it does not block you, and keep the Codex-side `service_tier` default.
- Do not pass `isolation: "worktree"`; the conductor script creates worktrees deterministically and records them on the task, so the packet's working directory is authoritative.
- Do not launch teammates or agent teams; plain background subagents are enough and cost less.

The spawn result contains the agent id. Record it: `task set --task 03 --status assigned --agent <id>`.

## Wait cheaply

1. **Completion notifications** arrive by themselves for each background worker. Nothing to arm.
2. **Event watcher**: arm one Monitor per run, re-armed on expiry (30 minutes is the maximum):

   ```
   Monitor(
     command: "python3 <script> watch --run <run-id> --until idle",
     description: "conductor events for <run-id>",
     timeout_ms: 1800000
   )
   ```

   Every line it prints is one event you must act on. It exits when no task is running, which is your cue to dispatch the next ready tasks or move to verification.
3. **Fallback check-in** for runs expected to last longer than 30 minutes: `CronCreate(cron: "*/25 * * * *", prompt: "Conductor check-in for run <run-id>: run status, act on blockers and done tasks, re-arm the watcher if it expired, otherwise do nothing.")` Note the job lives only in this session and expires after 7 days. Delete it with CronDelete at finish. If the user started you with `/loop`, use ScheduleWakeup with 1200 to 1800 seconds instead of cron.
4. Then **end your turn**. Do not run `sleep`, do not call `status` in a loop, do not read the worker's output file.

## Steer, resume, stop

- Steer or resume a worker (rejected review, blocker resolved): `SendMessage(to: "<agent id or name>", message: "Address the review at <review path>, then re-run the protocol in your packet.")`. The worker resumes with its full context.
- Stop a stalled worker: `TaskStop(task_id: "<agent id>")`, then re-dispatch a fresh one.
- Notify the user only for blockers that need their decision and at the end: `PushNotification(message: "<under 200 chars>", status: "proactive")`.

## What you may read

`status` output, packets, reports, review files, explorer briefs, and `check` output. Nothing else from workers.
