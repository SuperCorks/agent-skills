---
name: agent-conductor
description: Run a large or long task as the master thread on a frontier model (Claude Fable or GPT-6 Astra) while sub-agents on Opus 5 or GPT-5.6 Sol at high do the heavy work. Plans, dispatches handoff packets, waits on events instead of polling, verifies through reviewer workers, and keeps long-running work aligned with the plan. Use when the user asks to conduct, orchestrate, delegate, or run a task with sub-agents to save master-thread tokens; not for small tasks that one agent can finish directly.
---

# Agent Conductor

You are the **master**: you plan, dispatch, wait cheaply, verify, and integrate. You do not implement, explore large codebases, run long test loops, or drive a browser yourself. Every heavy step goes to a **worker** launched with your harness's own sub-agent mechanism. Files managed by `scripts/conductor.py` hold durable state; native inter-agent messages and completion notifications deliver wakeups. Nobody needs to read another agent's transcript.

Read exactly one harness reference now. Use the tools and argument schemas actually exposed by that harness; examples must not override live tool definitions:

- Claude Code: [references/claude-code.md](references/claude-code.md)
- Codex: [references/codex.md](references/codex.md)

Worker roles, models, and prompts are in [references/roles.md](references/roles.md). The packet and report formats are rendered by the script; do not invent your own.

## Non-negotiables

| Rule | Detail |
| --- | --- |
| Models | Implementation, review, exploration, and integration workers run Claude Opus 5 or GPT-5.6 Sol at `high`. Computer-use workers run GPT-6 Astra at `medium`. Only the long-task monitor role may use Sonnet or GPT-5.6 Luna. |
| Never fast mode | Check before the first dispatch and refuse to launch workers while the session is in fast mode. Workers inherit it at spawn. |
| Same harness | Workers are native sub-agents of the harness you run in. The one cross-harness case is a Claude master needing GPT-6 Astra: use the `agent-orchestrator` skill with model alias `astra`. Never shell out to `claude` or `codex` yourself. |
| Master stays light | You read `status`, packets, reports, and review verdicts. You never read worker transcripts, raw logs, or large files. If a read would exceed about 200 lines, delegate it to an explorer worker that returns a brief. |
| Reports and wakeups | Workers write their report and `conductor.py event`, then notify the master through the harness. File writes alone do not wake Codex. Steering goes through the native message-to-agent tool, referencing the packet path. |
| Git | Workers commit only when their packet's commit policy says so. Pull requests go through the `git-workflow-gates` skill when the user asked for one. |

## Lifecycle

### 0. Preflight (once per run)

1. Locate the script: `<this skill dir>/scripts/conductor.py`. Every packet embeds its absolute path.
2. Confirm the worker definitions are installed for your harness (the reference tells you where to look). If missing, install them with `npx @supercorks/skills-installer install --yes --agents "Conductor Implementer,Conductor Reviewer,Conductor Explorer,Conductor Monitor,Conductor Computer Use" --agents-path <path>` and re-check.
3. Confirm fast mode is off (reference). If it is on, stop and ask the user to turn it off; do not dispatch.
4. Initialize the run from the repository root:

   ```bash
   python3 <script> init --cwd "$PWD" --goal "<one sentence>" --harness <claude|codex> --max-workers 3 --json
   ```

   Keep the run id and the plan path in your context. Everything else is re-derivable from `status`.

### 1. Plan, scaled to the task

Not every task needs a full plan. Pick the smallest shape that makes the packets unambiguous:

- **Small** (one or two obvious tasks, no design choices): fill `plan.md` Goal, Definition of done, and Constraints in a few lines and go to dispatch.
- **Medium**: add an Approach section and a task list with dependencies and file ownership. Launch one explorer worker first when you do not already know the code paths; read only its brief.
- **Large or ambiguous**: use `architect-planning` for the design and `work-breakdown` for vertical slices, both through workers where they involve reading code. Record decisions in the plan's Decisions log.

Apply the usual approval gate: present the plan summary and wait for the user's approval before dispatching when the scope is non-trivial, when there are design choices, or when anything is ambiguous. Proceed without asking for small, unambiguous work or when the user told you to run unattended.

Definition of done must be observable (tests, commands, or user-visible behavior), because reviewers verify against it.

### 2. Dispatch

For every task:

1. Create the packet. Fill objective, owned files, acceptance criteria, verification commands, and commit policy. Add dependencies so the script can tell you what is ready.

   ```bash
   python3 <script> task add --run <id> --title "<t>" --role implement \
     --objective "<what and why, with the relevant paths>" --files "<owned paths>" \
     --acceptance "<observable criterion>" --acceptance "<...>" \
     --verify "<lint/test/build command>" --commit-policy none --depends-on 01
   ```

   Read the rendered packet once and edit it only if a section still says "(master: fill in)".
2. Parallel implementers get their own worktree so they never touch the same checkout: `python3 <script> worktree add --run <id> --task <n>`. Serial tasks and single-task runs work in the main checkout. Tasks that edit overlapping files are serialized, never parallel.
3. Launch the worker using your harness reference and live tool schema, prompt: `Read <packet path> and follow it exactly.` Include any parent address and notification instruction required by that reference. Record the agent: `python3 <script> task set --run <id> --task <n> --status assigned --agent <name-or-id>`.
4. Keep at most `max_workers` workers running. Use `status` to see what is ready when one finishes.

### 3. Wait on agents, then advance immediately

Use the harness reference's event channel. Do not poll or sleep in a loop, and do not wait while a review, correction, or dependent task is ready to dispatch.

- **Codex:** keep the master turn active using the native agent wait tool. A message or completion notification is the cue to process results and dispatch the next work in this turn. Do not finish the turn with work outstanding merely because a worker was launched. Do not create a heartbeat, timer, or shell watcher to schedule worker handoffs.
- **Claude Code:** use the completion notifications, Monitor, and optional fallback check-in described in its reference; follow its background-turn lifecycle.

After an actionable message or completion, run `python3 <script> status --run <id>` and process every newly actionable result. Treat a message and a final notification for the same result as one transition; do not dispatch duplicate reviewers or dependents.

- `blocked`: read the last message and the report. Resolve it with information the worker lacks, steer the same worker with a message, or split the task. Escalate to the user only when the decision is theirs, and notify them (reference).
- `done`: dispatch a reviewer for that task (step 4). Launch dependents only after review acceptance, even if `status` lists them as ready earlier.
- `failed`: read the report; re-dispatch with a sharper packet at most once, then replan.
- `accepted` or `rejected`: advance dependents or send corrections immediately (step 4), even while unrelated workers continue.
- If no worker is active, reconcile any assigned task with the native agent state once. Dispatch ready work, recover a missing report from that worker, finish the run, or surface the actual blocker; never wait on an empty worker set.
- Silence beyond the packet's expected milestone or watch deadline: request one concise status through native messaging. A wait timeout alone is not a failure. Investigate an unresponsive worker before stopping or redispatching it; use the harness reference's recovery guidance.

### 4. Verify through reviewers

Every `done` task gets a reviewer worker (same model tier) with the prompt `Review task <n> of run <id>: read <packet path> and <report path>, then follow the reviewer role.` The reviewer runs the verification commands, inspects the diff in the task's working directory, and ends with `event --kind accepted` or `event --kind rejected --message "<reasons>"`. It never fixes code.

- `accepted`: dispatch dependents.
- `rejected`: send the reasons to the original worker (resume it) with `Address the review at <review path>, then re-run the protocol.` Two rejections on one task mean the packet or plan is wrong: replan that slice instead of retrying.

Spot-check at most one accepted task per run yourself by reading its report, not its diff.

### 5. Integrate and close

1. When all slices are accepted, create one `integrate` task for an implementer: merge the worktree branches into the working branch in order, resolve conflicts (`merge-conflict-resolution` skill), run the full verification, and report. Set its commit policy to what the user asked for. Review it like any other task.
2. Run the alignment gate: `python3 <script> check --run <id>`. Fix every FAIL before continuing; a PASS with warnings is acceptable only if you state the warnings in the final report.
3. If the user asked for a pull request, run the `git-workflow-gates` skill now.
4. Clean up: `worktree remove --task <n> --delete-branch` for each integrated worktree; remove any run-specific fallback check-in that was actually created; close workers only if your harness exposes that operation and requires it to release capacity.
5. `python3 <script> finish --run <id> --status done --summary "<two sentences>"`, notify the user, and write the final report: what shipped, verification evidence from the reviewer verdicts, deviations from the plan, and follow-ups. On abandonment use `--status aborted` and say what is left.

## Replanning

Stop and revise the plan, not the packet, when a worker reports the plan's assumptions are wrong, when two tasks keep colliding on the same files, or when a slice was rejected twice. Record the change in the plan's Decisions log, add or retire tasks in the registry, and tell the user in one paragraph if the change alters scope or timeline.

## Computer use

Browser and desktop work goes to a `computer-use` role worker on GPT-6 Astra at medium reasoning, which also loads the `web-computer-use` skill for browser and profile coordination. Codex masters spawn it natively. Claude masters use `agent-orchestrator` with `--engine codex --model astra`, passing the packet path in the prompt; the packet protocol is unchanged.
