# Codex reference for the master

Use native inter-agent communication to advance the run in the current turn. Files preserve evidence across interruptions; they are not a notification transport. The live tool schemas are authoritative: Codex Desktop and CLI versions expose different agent APIs. Do not combine arguments from different versions.

## Preflight checks

- **Agent tools**: identify the exposed spawn, message, follow-up, wait, and status tools. The Desktop examples below use `collaboration.*`. Call those tools directly, not inside `functions.exec`. If the harness exposes another API, use its documented equivalents. If no native agent wait is available, report that limitation; do not silently replace it with a scheduled automation.
- **Worker definitions**: inspect `~/.codex/agents/` and `.codex/agents/` for `conductor_implementer`, `conductor_reviewer`, `conductor_explorer`, `conductor_monitor`, and `conductor_computer_use`. Confirm their models and reasoning match the roles below. Fix stale definitions through the install workflow before launching; do not assume explicit spawn settings can override a conflicting definition.
- **Fast mode**: check the current session's fast-mode state and applicable `service_tier` setting. If fast mode is explicitly enabled, ask the user to turn it off before dispatch. Do not edit their runtime config yourself or assume an unfamiliar tier name means fast mode.

## Launch a worker

With the Desktop `collaboration` tools:

```text
collaboration.spawn_agent({
  task_name: "implement_widget",
  agent_type: "conductor_implementer",
  model: "gpt-5.6-sol",
  reasoning_effort: "high",
  fork_turns: "none",
  message: "Read <packet path> and follow it exactly. Your parent is /root. After writing your report and recording an actionable event, notify /root through collaboration.send_message with the run, task, result kind, and report path; then return your final result."
})
```

Use your actual canonical agent path in place of `/root` when conducting from a nested agent. The parent address is delivery metadata; keep the task instructions in the packet. Include this notification instruction for every role, including reviewers and explorers that receive different pointer prompts.

- Start with no inherited conversation. Here that is `fork_turns: "none"`; use `fork_context: false` only if the exposed spawn schema actually defines it. Do not pass both.
- Reviewer: `conductor_reviewer`, Sol at high, prompt `Review task <id> of run <run-id>: read <packet path> and <report path>, then follow the reviewer role.` Append the parent and notification instruction; send the verdict and review path after recording `accepted` or `rejected`.
- Explorer: `conductor_explorer`, Sol at high; notify with the completed brief path.
- Monitor: `conductor_monitor`, `gpt-5.6-luna` at medium, for an external process such as CI or deployment. Do not dedicate a monitor to watching other subagents.
- Computer use: `conductor_computer_use`, `gpt-6-astra` at medium.
- Integration: `conductor_implementer`, Sol at high.

Record the returned id or canonical path with `task set --task <id> --status assigned --agent <agent>`. Keep at most `max_workers` active workers and respect the runtime's actual capacity.

## Stay in the native event loop

1. **Drain actionable results first.** On a native message or final-status notification, run `status` once, read only the changed reports or reviews, and process all available transitions. Dispatch a reviewer for `done`, dependents for `accepted`, or corrections for `rejected` immediately. Unrelated running workers do not hold up these handoffs. Deduplicate a message and final notification for the same result using the task registry and current assignment.
2. **Wait only when the next action depends on an active worker.** With the Desktop API, call `collaboration.wait_agent({timeout_ms: 60000})`. It waits on the team's mailbox and wakes early for agent updates or user input; its schema has no `targets` argument. Use a longer timeout only when allowed by both the exposed tool and the current session instructions. The timeout is a ceiling, not a delay before processing messages.
3. **Consume the delivered message.** A wait may only identify which agent has an update; process the native message or final notification delivered with it. If a notification lacks enough state, use a compact native agent-status snapshot and the changed report. Do not read worker transcripts.
4. **Continue in this turn.** After a timeout with no update, return to the native wait without a shell sleep, repeated registry reads, or unchanged progress messages. After an update, repeat step 1. A native wait with early event wakeup is not timer polling. Only run a status recovery check when a packet milestone/deadline is overdue or native state disagrees with the registry.
5. **Never wait on zero active workers.** Reconcile an apparently assigned/running task with native agent state once. If its worker finished without a report, follow up with that worker for the missing result. Otherwise dispatch ready work, finish, or surface the actual blocker. Do not send a final response merely because all workers were dispatched or a batch has finished; finish when the requested run is complete, the user asks to stop, or further progress truly requires unavailable input or capability.

If the current CLI exposes a wait that takes agent ids, include all relevant active workers so the first result wakes you, using that tool's actual schema. Do not invent a hybrid such as `wait_agent(targets: [...])` for the Desktop mailbox tool.

### No timer-based worker handoffs

Do not run `conductor.py watch`, a shell `sleep`, or a heartbeat automation to wait for native Codex subagents. A background command session is not an agent-message subscription, and ending the master turn can leave completed work unprocessed until the next user message or scheduled wakeup. A 20–30 minute check-in must never be the mechanism that starts a review or dependent task.

Create a scheduled check only when the user actually requests scheduled work or a later external follow-up. Use the current automation tool schema; do not add one merely because a conductor run is long. When taking over a run with an old conductor heartbeat, establish native tracking and process pending results first, then pause that run's obsolete handoff heartbeat. Preserve separately requested external monitoring.

## Steer, resume, recover

With the Desktop API:

- Steer a running worker: `collaboration.send_message({target: "<agent>", message: "<direction and packet or review path>"})`. It queues a message; it does not start an idle worker.
- Resume an idle/finished worker: `collaboration.followup_task({target: "<agent>", message: "Address the review at <review path>, then re-run your packet protocol and notify the parent."})`. This starts a new turn when idle. Sending a message alone is insufficient.
- Redirect work immediately only when necessary: `collaboration.interrupt_agent({target: "<agent>"})`, then `followup_task` with the new instructions.
- Inspect lifecycle state when reconciling capacity or a missing result: `collaboration.list_agents({})`. Do not poll it. Do not invent `close_agent` if none is exposed, and do not infer active capacity from the UI's historical Done count. If your CLI exposes a close operation and says completed agents retain capacity, close them according to that schema after recording their reports.

A worker silent past its expected milestone gets one concise native status request. If it remains unresponsive past a reasonable recovery deadline, inspect native state and interrupt or replace it only after establishing that the old worker cannot continue writing the same files. A wait timeout by itself is not evidence of a failed worker.

Progress messages from the user steer the current run; answer briefly and continue the event loop unless they explicitly pause or stop it. Ask for missing input only when it prevents further authorized work, after dispatching any independent work that can still proceed.

## What you may read

Native messages and final notifications, compact agent status, conductor `status`, packets, reports, review files, explorer briefs, and `check` output. No worker transcripts or raw logs.

[Official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) describes native spawning, follow-up, waiting, and lifecycle controls. Exact tool names and arguments must come from the running harness.
