---
name: agent-conductor
description: Run a large or long task as the master thread on a frontier model (Claude Fable or GPT-6 Astra) while sub-agents on Opus 4.8 or GPT-5.6 Sol at xhigh do the heavy work. Plans, dispatches handoff packets, waits on events instead of polling, verifies through reviewer workers, and keeps long-running work aligned with the plan. Use when the user asks to conduct, orchestrate, delegate, or run a task with sub-agents to save master-thread tokens; not for small tasks that one agent can finish directly.
---

# Agent Conductor

You are the **master**: you plan, dispatch, wait cheaply, verify, and integrate. You do not implement, explore large codebases, run long test loops, or drive a browser yourself. Every heavy step goes to a **worker** launched with your harness's own sub-agent mechanism. All state between you and the workers lives in files managed by `scripts/conductor.py`, so nobody reads anyone else's transcript.

Read exactly one harness reference now and follow its tool calls verbatim:

- Claude Code: [references/claude-code.md](references/claude-code.md)
- Codex: [references/codex.md](references/codex.md)

Worker roles, models, and prompts are in [references/roles.md](references/roles.md). The packet and report formats are rendered by the script; do not invent your own.

## Non-negotiables

| Rule | Detail |
| --- | --- |
| Models | Implementation, review, exploration, and integration workers run Claude Opus 4.8 or GPT-5.6 Sol at `xhigh`. Computer-use workers run GPT-6 Astra at `medium`. Only the long-task monitor role may use Sonnet or GPT-5.6 Luna. |
| Never fast mode | Check before the first dispatch and refuse to launch workers while the session is in fast mode. Workers inherit it at spawn. |
| Same harness | Workers are native sub-agents of the harness you run in. The one cross-harness case is a Claude master needing GPT-6 Astra: use the `agent-orchestrator` skill with model alias `astra`. Never shell out to `claude` or `codex` yourself. |
| Master stays light | You read `status`, packets, reports, and review verdicts. You never read worker transcripts, raw logs, or large files. If a read would exceed about 200 lines, delegate it to an explorer worker that returns a brief. |
| Files are the protocol | Workers report through `conductor.py event` and their report file. Steering goes through the harness's message-to-agent tool, referencing the packet path. |
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
3. Launch the worker with the exact call from your harness reference, prompt: `Read <packet path> and follow it exactly.` Record the agent: `python3 <script> task set --run <id> --task <n> --status assigned --agent <name-or-id>`.
4. Keep at most `max_workers` workers running. Use `status` to see what is ready when one finishes.

### 3. Wait without spending tokens

Do not poll and do not sleep in a loop. Arm the harness's event channel from the reference, then end your turn:

- A completion notification from the harness for each background worker.
- The event watcher (`conductor.py watch`) that surfaces only `blocked`, `done`, `failed`, `accepted`, and `rejected` events.
- One fallback check-in every 20 to 30 minutes for runs longer than that, so a silent worker cannot stall the run. Remove it when the run finishes.

When you wake up, run `python3 <script> status --run <id>` first and act only on what changed:

- `blocked`: read the last message and the report. Resolve it with information the worker lacks, steer the same worker with a message, or split the task. Escalate to the user only when the decision is theirs, and notify them (reference).
- `done`: dispatch a reviewer for that task (step 4) and any newly ready tasks.
- `failed`: read the report; re-dispatch with a sharper packet at most once, then replan.
- Silence past the fallback window with no `progress` events: message the worker asking for a one-line status; if nothing arrives by the next check-in, stop it and re-dispatch.

### 4. Verify through reviewers

Every `done` task gets a reviewer worker (same model tier) with the prompt `Review task <n> of run <id>: read <packet path> and <report path>, then follow the reviewer role.` The reviewer runs the verification commands, inspects the diff in the task's working directory, and ends with `event --kind accepted` or `event --kind rejected --message "<reasons>"`. It never fixes code.

- `accepted`: dispatch dependents.
- `rejected`: send the reasons to the original worker (resume it) with `Address the review at <review path>, then re-run the protocol.` Two rejections on one task mean the packet or plan is wrong: replan that slice instead of retrying.

Spot-check at most one accepted task per run yourself by reading its report, not its diff.

### 5. Integrate and close

1. When all slices are accepted, create one `integrate` task for an implementer: merge the worktree branches into the working branch in order, resolve conflicts (`merge-conflict-resolution` skill), run the full verification, and report. Set its commit policy to what the user asked for. Review it like any other task.
2. Run the alignment gate: `python3 <script> check --run <id>`. Fix every FAIL before continuing; a PASS with warnings is acceptable only if you state the warnings in the final report.
3. If the user asked for a pull request, run the `git-workflow-gates` skill now.
4. Clean up: `worktree remove --task <n> --delete-branch` for each integrated worktree; delete the fallback check-in; close any workers your harness keeps open.
5. `python3 <script> finish --run <id> --status done --summary "<two sentences>"`, notify the user, and write the final report: what shipped, verification evidence from the reviewer verdicts, deviations from the plan, and follow-ups. On abandonment use `--status aborted` and say what is left.

## Replanning

Stop and revise the plan, not the packet, when a worker reports the plan's assumptions are wrong, when two tasks keep colliding on the same files, or when a slice was rejected twice. Record the change in the plan's Decisions log, add or retire tasks in the registry, and tell the user in one paragraph if the change alters scope or timeline.

## Computer use

Browser and desktop work goes to a `computer-use` role worker on GPT-6 Astra at medium reasoning, which also loads the `web-computer-use` skill for browser and profile coordination. Codex masters spawn it natively. Claude masters use `agent-orchestrator` with `--engine codex --model astra`, passing the packet path in the prompt; the packet protocol is unchanged.
