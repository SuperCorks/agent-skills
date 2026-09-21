# Claude Code reference for the master

Use these exact mechanisms. Names are the tools Claude Code exposes to you; if one is deferred, load it with ToolSearch first.

## Preflight checks

- **Worker definitions**: `ls ~/.claude/agents ~/.claude_*/agents .claude/agents 2>/dev/null | grep -i conductor`. You need `Conductor Implementer`, `Conductor Reviewer`, `Conductor Explorer`, `Conductor Monitor`, and `Conductor Computer Use`. Their frontmatter pins `model: claude-opus-5` and `effort: high` (monitor: `sonnet`, `medium`), which is the only way to guarantee effort per worker: the Agent tool has no per-launch effort parameter and would otherwise inherit the session's.
- **Fast mode**: fast mode is a session toggle (`/fast`) and a worker inherits it at spawn. You cannot toggle it yourself. If the session is in fast mode, ask the user to turn it off before you dispatch anything.
- **Effort**: if the definitions are missing and cannot be installed, the session itself must be at `high` (`/effort high`) so inherited effort matches; say so to the user.

## Launch a worker

Always background, always the definition's `subagent_type`, prompt only the packet pointer. Do not pass `model`: the definition pins it, and a `model` argument would override the pin (the tool accepts only aliases such as `opus`):

```
Agent(
  subagent_type: "conductor-implementer",
  run_in_background: true,
  description: "Task 03 implement",
  prompt: "Read /Users/.../runs/<run-id>/tasks/03-<slug>.md and follow it exactly."
)
```

- Reviewer: `subagent_type: "conductor-reviewer"`, prompt `Review task 03 of run <run-id>: read <packet path> and <report path>, then follow the reviewer role.`
- Explorer: `subagent_type: "conductor-explorer"`, prompt a question plus the brief path to write.
- Monitor: `subagent_type: "conductor-monitor"` (its definition pins Sonnet).
- Computer use: not a Claude worker. Use the `agent-orchestrator` skill: `python3 <agent-orchestrator>/scripts/agent_orchestrator.py run --engine codex --model astra --cwd <dir> --timeout 2700 --prompt "Read <packet path> and follow it exactly."` That call is awaited; run it from a background Bash command so it does not block you, and keep the Codex-side `service_tier` default.
- Do not pass `isolation: "worktree"`; the conductor script creates worktrees deterministically and records them on the task, so the packet's working directory is authoritative.
- Do not launch teammates or agent teams; plain background subagents are enough and cost less.

The spawn result contains the agent id. Record it: `task set --task 03 --status assigned --agent <id>`. For a reviewer, use `task set --task 03 --reviewer <id>`.

## Wait cheaply

1. **Completion notifications** arrive by themselves for each background worker, including reviewers. They are your signal for `done`, `accepted`, and `rejected`. Nothing to arm.
2. **Event watcher** for what notifications miss (a worker that reports `blocked` or `failed` and keeps running): arm one Monitor per run.

   ```
   Monitor(
     command: "python3 <script> watch --run <run-id> --until idle",
     description: "conductor blockers for <run-id>",
     timeout_ms: 1800000
   )
   ```

   It prints only `blocked` and `failed` lines, then `IDLE: ...` and exits once no task is assigned, running, awaiting review, or being corrected. A task that is `done` keeps it alive while its reviewer works. Re-arm it when it expires (30 minutes is the maximum) or when you dispatch new work after it exited. A completion notification and a watcher line for the same result are one transition: act once.
3. **Fallback check-in** for runs expected to last longer than 30 minutes. Use one-shot jobs that renew themselves only after a successful check-in. A session that is rate-limited, out of credits, or stuck then stops rescheduling instead of firing all night. First `CronList` and delete any existing check-in for this run, then:

   ```
   CronCreate(
     cron: "<M H DoM Mon *> printed by `checkin`, or now + 25 min>",
     recurring: false,
     prompt: "Conductor check-in for run <run-id>: run `python3 <script> checkin --run <run-id>`. On STOP, schedule nothing more; if the reason is no progress, notify the user once. On ACT, handle the listed items and re-arm the watcher if it expired. On OK, do nothing else. Unless the verdict was STOP, create the next one-shot check-in with the cron it printed and this same prompt."
   )
   ```

   `checkin` returns `STOP` when the run is finished or after 3 consecutive check-ins with no new event. If the user started you with `/loop`, use ScheduleWakeup with 1200 to 1800 seconds instead of cron, and stop scheduling on the same `STOP` verdict.
4. Then **end your turn**. Do not run `sleep`, do not call `status` in a loop, do not read the worker's output file.

## Steer, resume, stop

- Steer or resume a worker (rejected review, blocker resolved): `SendMessage(to: "<agent id or name>", message: "Address the review at <review path>, then re-run the protocol in your packet.")`. The worker resumes with its full context.
- Stop a stalled worker: `TaskStop(task_id: "<agent id>")`, then re-dispatch a fresh one.
- Notify the user only for blockers that need their decision and at the end: `PushNotification(message: "<under 200 chars>", status: "proactive")`.

## What you may read

`status` output, packets, reports, review files, explorer briefs, and `check` output. Nothing else from workers.
