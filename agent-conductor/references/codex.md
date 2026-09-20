# Codex reference for the master

Use these exact tools. They exist when `[features] multi_agent = true` in `~/.codex/config.toml`.

## Preflight checks

- **Worker definitions**: `ls ~/.codex/agents .codex/agents 2>/dev/null | grep -i conductor`. You need `Conductor Implementer.toml`, `Conductor Reviewer.toml`, `Conductor Explorer.toml`, `Conductor Monitor.toml`, and `Conductor Computer Use.toml`; their `name` fields are `conductor_implementer`, `conductor_reviewer`, `conductor_explorer`, `conductor_monitor`, `conductor_computer_use`. They pin `model` and `model_reasoning_effort`, and you also pass both explicitly on every spawn so a stale definition cannot downgrade a worker.
- **Fast mode**: `grep -E '^service_tier' ~/.codex/config.toml`. Anything other than absent or `"default"` (for example `"fast"`) means stop and ask the user to reset it before you dispatch; do not edit their config yourself. Spawned agents inherit the tier.

## Launch a worker

```
spawn_agent(
  agent_type: "conductor_implementer",
  model: "gpt-5.6-sol",
  reasoning_effort: "high",
  fork_context: false,
  message: "Read /Users/.../runs/<run-id>/tasks/03-<slug>.md and follow it exactly."
)
```

- `fork_context: false` always. The packet carries everything the worker needs; forking your context spends tokens and leaks your plan-level reasoning.
- Reviewer: `agent_type: "conductor_reviewer"`, same model and effort, message `Review task 03 of run <run-id>: read <packet path> and <report path>, then follow the reviewer role.`
- Explorer: `agent_type: "conductor_explorer"`, same model and effort.
- Monitor: `agent_type: "conductor_monitor"`, `model: "gpt-5.6-luna"`, `reasoning_effort: "medium"`.
- Computer use: `agent_type: "conductor_computer_use"`, `model: "gpt-6-astra"`, `reasoning_effort: "medium"`.

The result contains the agent id. Record it: `task set --task 03 --status assigned --agent <id>`.

## Wait cheaply

1. **Final-status notifications**: when a spawned agent finishes, Codex delivers a notification with its final message. You do not need to poll for it.
2. **Long waits** when you are genuinely blocked on the next critical-path result: `wait_agent(targets: [<ids>], timeout_ms: 3600000)` with the longest timeout the tool allows (one hour), passing every running id so whichever finishes first wakes you. Never call it with a short timeout in a loop.
3. **Event watcher**: run `python3 <script> watch --run <run-id> --until idle` as a background shell command whose output you check only when a notification wakes you; each line is one actionable event. If your environment cannot deliver background output, skip this and rely on 1 and 2 plus `status`.
4. **Fallback check-in** for runs expected to outlast a single wait: create a heartbeat automation with `automation_update` (`mode: "create"`, `kind: "heartbeat"`, a 20 to 30 minute interval, `model` set to your own model, `status: "ACTIVE"`) whose prompt is: `Conductor check-in for run <run-id>: run status, act on blockers and done tasks, otherwise do nothing.` Pause it (`status: "PAUSED"`) at finish. If `automation_update` is not available in this environment (plain CLI), rely on `wait_agent` instead.
5. Then **end your turn**. Do not sleep in a loop and do not call `status` repeatedly.

## Steer, resume, stop

- Steer a running worker: `send_input(target: "<id>", message: "...", interrupt: false)`. Use `interrupt: true` only to redirect it immediately (for example a blocker you just resolved).
- Resume a finished worker for a rejected review: `resume_agent(id: "<id>")` if it was closed, then `send_input` with `Address the review at <review path>, then re-run the protocol in your packet.`
- Completed agents still count toward the concurrency limit until closed: `close_agent(target: "<id>")` once its report has been reviewed. Keep `max_workers` in step with that limit.
- Notify the user only for blockers that need their decision and at the end, through the normal assistant reply; the configured `notify` hook already relays turn completion.

## What you may read

`status` output, packets, reports, review files, explorer briefs, and `check` output. Nothing else from workers.
