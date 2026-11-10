---
name: full-send
description: Take a change from its current state to a merged pull request while the user is away. Finish it, prove it, review it, file it, babysit it through CI and review bots, and merge it once the merge gate passes. Use only when the user says "full send" or clearly asks for unattended delivery through merge. Not for stopping at a merge-ready PR (full-stop), opening a PR (github-pr-formatting), getting one green without merging (pr-babysit), or a review loop alone (pre-pr-review).
---

# Full Send

A "full send" means the user is not watching this thread and wants the work done end to end. Your updates and your final message go unread until long after you stop. You own the work from its current state to a merged PR.

If the user did not clearly ask for a full send, do not assume this autonomy.

## What the request grants

- Merge the PR once the merge gate passes.
- Resolve conflicts on this task's branch with `merge-conflict-resolution`, update it from the base, and push. Force-push with `--force-with-lease` to this task's own branch, and no other, when the update is a rebase.
- Use the test methods that Proof needs without asking first. See "Testing permission".
- Move the work's Kernel task to In review. See "Kernel tasks".

Where `pre-pr-review` or `pr-babysit` stop to ask before committing, pushing, resolving conflicts, rebasing, marking a draft ready, or merging, this request is the answer. Every other guardrail in those skills still applies: no `--no-verify`, no weakened tests, no edited workflows to go green, and pushes go only to the PR's head branch.

The request does not cover:

- Messages to people, such as replies to human reviewers, Slack, or email. Draft them and leave the send to the user.
- Production: manual deploys, migrations on hosted databases, secrets, provider settings, publishing a Lovable app.
- Deleting data, closing PRs, retargeting a base, force-pushing any other branch, or bypassing branch protection.

## Testing permission

A "full send" request is the permission. If a project file or other instruction says to ask before a test method, or to leave testing to the user, this request replaces that rule for this task.

That includes ask-first rules for computer use, browser automation, simulators and devices, running the app or a dev server, screenshots, video recordings, and visual checks. Use the method that gives direct proof, and list it in the report.

Rules about how to test still apply. Follow rules that name the correct command, fixture, or check, and follow `web-computer-use` for browser and profile choice. This permission only removes the ask-first or leave-it-to-the-user step. If a preferred method cannot prove the change, use a gated method under this permission.

It covers only the tests this task needs. It does not cover anything under "The request does not cover", consequential browser actions such as purchases or real sends, or a harness or system approval prompt if one appears.

## Steps

1. **Finish the change** the user asked for, starting from the latest base (see "Branch workflow"). If you are on the default or integration branch, create a Conventional branch from the fetched base, in a new local worktree in projects where that applies. For a visible change, capture the "before" first (see "Reviewable PR"). In a Lovable-managed repo, see "Lovable repos".
2. **Prove it.** Get proof for every change you made. See "Proof".
3. **Review it.** Use your judgment on whether the diff warrants `pre-pr-review`, and say in the report what you chose and why. When you run it, run it on the whole branch diff with the user's request as the intent, with the "Review pair" as its reviewers. Commit the fixes it accepts and prove the ones that change behavior. If it stops on a decision only the user can make, see "Asking the user".
4. **File the PR** against the base with `github-pr-formatting`, or use the one that already exists for this branch. Update the branch from the latest base first. Open a real PR, not a draft, so review bots run. Make it easy to review, with the evidence in the PR itself (see "Reviewable PR"). Its Verification section says how you proved the change.
5. **Babysit the PR** with `pr-babysit` in `drive` mode. It handles threads through `address-pr-comments`. Fix real findings and CI failures, and prove each fix before you push it. Write bot replies with `my-voice`, because they go out under the user's name. Keep the branch on the latest base.
6. **Merge** when the merge gate passes.
7. **Wrap up.** If the merge triggers a deploy through the repo's own pipeline, read its status on the merge commit. If it fails, report it and ask. Do not revert or redeploy on your own.
8. **Report** in your final message. See "Report".

Stay active from step 1 to step 8. If you end your turn while checks or bots are pending and nothing will wake you, the work stops, because nobody will prompt you again. See "Waiting".

## Branch workflow

- **Base:** the integration branch the project names, or `develop` when it exists, or the default branch.
- **Worktree:** Create the branch in a new local worktree when the project's instructions call for task worktrees, the repo already keeps linked worktrees (`git worktree list`), or the current checkout holds work that is not part of this task. Skip it when this task already has its own worktree or branch, and in a Lovable repo. Use the script and location the project names. Otherwise use `t3_worktree_handoff` in T3 Code, with a `continuationPrompt` that carries this request, because the thread waits without one; `EnterWorktree` in Claude Code; or an ignored `.worktrees/<task>/` elsewhere. Run the project's setup there before you prove anything. Leave the worktree in place when you finish, unless the project's workflow removes it.
- **Always work from the latest base.** Run `git fetch` before you start, before you file the PR, after each wake, and right before merging. Whenever the base has moved, update the branch before you go on, then run your checks again and wait for green.
- **Update and merge** the way the repo documents in its AGENTS.md, CONTRIBUTING, or similar. If it documents nothing, squash-merge the PR. Update the branch by rebasing while its commits are unpushed, and by merging the base in after that. If squash merging is disabled, use the method its recent merged PRs use.

## Proof

Proof is evidence you observed yourself in this session: command output, a reproduction, a screenshot. Use the most direct proof the change allows:

- Reproduce the original failure, apply the fix, then watch the same reproduction pass.
- Run the checks that the repo's CI runs (typecheck, lint, tests).
- When the behavior has no test and the repo has a test setup, add one focused test that fails without the fix. Use `test-engineer` in regression mode.
- For UI and runtime behavior, run the app and look at the change. Green mocked tests do not prove that the user experience works. If the repo has a project-local `verify-<app>` skill, drive the app with it. Otherwise follow `web-computer-use` for browser work.
- For user-facing behavior changes, apply [test-engineer's focused journey method](../test-engineer/references/user-story-testing.md): complete the affected story from its real entry point, preserve the same data through material handoffs, and verify the durable outcome and relevant recovery variants. Inspect existing assertions for missing connections; page checks and seeded downstream tests alone are insufficient. Scope this proof to the change and name any simulated or untested boundary.

If you cannot find a way to prove a change, you do not have full confidence. Ask the user.

## Review pair

When you run `pre-pr-review`, its reviewers are this pair, not two reviewers on the session's model. This replaces its model rule and its optional third reviewer. Its lenses, passes, lead judgment, and stop rules stay.

- **Fable:** Claude Fable 5.2 (`claude-fable-5-2`) at `xhigh` effort.
- **Astra:** GPT-6 Astra (`gpt-6-astra`) at `xhigh` reasoning.

Each reviewer reads both lens files (correctness and quality) and tags each finding with its lens. Findings raised by both reviewers rank highest. Launch both in each pass, in parallel, with fresh reviewers every pass. Their prompts follow `pre-pr-review`, including "read-only, do not edit files".

**Never fast mode, never a substitute.** Neither reviewer may run in fast mode or on another model. Native sub-agents can inherit the session's fast mode or Codex service tier, the user's Codex config defaults to the Fast tier (`service_tier = "priority"`), and the `fable` alias does not pin a version. So launch both reviewers with explicit settings, never as plain native sub-agents, and confirm what answered. For Fable, read `executedModel` on the T3 task or `modelUsage` in the CLI run's `stdout.txt`. For Astra, T3 may report `executedModel` as null, so read the reviewer's Codex session log under `~/.codex/sessions/` for its `model`, `reasoning_effort`, and `service_tier`. A wrong model or a Fast tier means that reviewer is missing.

### In T3 Code

- Use `delegate_task` with `role: "review"` and a `target` naming `model`, `providerInstanceId`, and `options`.
- Fable: `claude-fable-5-2` with `{effort: "xhigh", ultracode: false}`.
- Astra: `gpt-6-astra` with `{reasoningEffort: "xhigh", serviceTier: "default"}`.
- Add `fastMode: false` wherever `orchestrator_capabilities` lists that option.
- Choose only among instances that list the model. If the short list omits it, call `orchestrator_capabilities` again with `search` set to the model ID before treating the reviewer as unavailable.
- Use this thread's instance if it lists the model. Otherwise, and for the other reviewer, use the same client account's instance; if none clearly matches, the provider's default instance (the one named after the driver, such as `codex`). Name both instances in the report.

### Elsewhere

- Use an awaited `agent-orchestrator` run with `--out-dir` inside `pre-pr-review`'s temp directory, so nothing lands in the repo.
- Fable: prefix the command with `CLAUDE_CODE_DISABLE_FAST_MODE=1 CLAUDE_CODE_NO_MODEL_FALLBACK=1` and pass `--engine claude --model claude-fable-5-2 --reasoning xhigh`.
- Astra: `--engine codex --model gpt-6-astra --reasoning xhigh --extra-arg=-c --extra-arg='service_tier="default"'`.
- In Claude Code, run each as a background command with a timeout above the helper's 45-minute ceiling. In Codex, start both in one foreground shell call with `&`, then `wait`, under a timeout above that ceiling, and read each run's manifest for its exit code.
- This review is the explicit request that lets these runs go past `agent-orchestrator`'s two-pass limit, run in the background, and pass the tier override through `--extra-arg`, despite its note to leave `service_tier` at its default.

If a reviewer cannot run, for example because its provider is unavailable or not signed in, do not substitute another model. Run the pass with the reviewer that can, and say in the report which one was missing and why. If neither can run, review the diff yourself through both lenses, as `pre-pr-review` does without sub-agents, and report that the pair did not run.

## Reviewable PR

A reviewer should be able to judge the change from the PR alone, without running it.

- Keep the diff to this request. Leave unrelated cleanup out, and list it as a follow-up.
- For visible changes, show before and after screenshots of the same screen, viewport, and data, side by side in the Verification section. Capture the "before" from the base before you edit. If you missed it, run the base in a second worktree.
- For flows, animation, or timing that stills cannot show, add a short video recording of the path that changed. Use the recorder of your browser or device method, such as `bsk video` or `agent-device`.
- For changes with nothing to see, show similar proof: a reproduction's failing and passing output, before and after numbers, or a short CLI or API transcript. Trim it to the lines that matter.
- Upload images and videos to the PR directly. `gh` cannot upload them, so this goes through the browser. You can also host them with `publish-artifacts` and embed the links, but GitHub plays only videos uploaded directly, and a hosted video appears as a link.
- `publish-artifacts` URLs are public. Host a capture there only if it shows no real customer data, credentials, or private client content. Otherwise use test data, or crop the capture.
- Retake evidence when a later commit changes what it shows. Skip evidence that tells the reviewer nothing.

## Merge gate

Full confidence means all of these are true on the latest commit:

- Your proof covers every change in the diff.
- The PR shows the evidence for the final diff (see "Reviewable PR"), or says why it cannot.
- If you ran `pre-pr-review`, it left no Act on finding open. If a later fix changed behavior beyond what a finding asked for, run one more pass first.
- Required checks are green.
- The reviewers this repo uses have finished on the head (see "Waiting"). Each finding is fixed, or dismissed with a written reason.
- No human review still requests changes.
- The branch contains the latest base commit, and GitHub reports the PR as mergeable.

Right before merging, run `git fetch` and read the PR again. If the base moved, update the branch and wait for green again. Merge with the method from "Branch workflow". If the repo uses a merge queue or auto-merge, stay until GitHub reports the PR as merged. Merge through branch protection as configured. Never use `--admin` or other bypasses. You can ignore automated reviews that ask for "needs human review" when you have high confidence in your changes.

## Waiting

Learn which reviewers this repo uses from its last few merged PRs, and wait only for those. Many of the user's repos have no bots or no CI. When a repo has neither, the checks and bot items of the gate are met with nothing to wait for.

- **T3 Code:** if `watch_pull_request` is available (load it with ToolSearch), call it once and end your turn. T3 wakes you on checks, comments, and conflicts. Call `unwatch_pull_request` before you hand off or ask the user anything. Without it, run `pr-babysit`'s watch command in the background and call `t3_background_wait` on it before you end the turn.
- **Claude Code:** run `pr-babysit`'s background watch. The harness wakes you when it exits.
- **Codex:** run `pr-babysit`'s foreground watch with a shell timeout.

Some bots, such as Copilot, review without a check. When checks finish, read the reviews on the head again. If such a bot usually reviews this repo and has not yet reviewed the head, run one background command that exits when its review lands on the head, with a 30-minute timeout. If it times out, continue, and say so in the report.

When a wake needs no action, end the turn without a message. Never post or say "still waiting".

## Lovable repos

In a repo that `lovable-workflow` applies to, follow that skill unless the project's instructions use PRs. Delivery is then a validated push to the connected branch, not a PR. Do steps 1 to 3, then fetch and push as `lovable-workflow` describes, with no force-push and no history rewrite. That push takes the place of steps 4 to 6, so the report carries the evidence from "Reviewable PR". Publishing stays with the user; report it as the remaining step.

## Kernel tasks

If the work belongs to a Kernel task, follow the `kernel` skill with the presets in AGENTS.md. Do the `yolo` actions as they come up: link the PR once it is open, and save the work summary after the merge. Once the PR is linked, move the task to In review, or after the validated push in a Lovable repo, where there is no PR. This request is the approval for that move when `task_lifecycle` is `ask`. Follow the `kernel` skill's rules for it, such as leaving a task that is already Blocked or Done unchanged. Do not stop to ask about other `ask` actions. List them in the report as proposals, such as attaching this thread or moving the task to Done. A merged PR is not by itself proof that the task is done.

## Asking the user

A question in a normal message goes unseen, and the thread looks done. To ask the user something, use the harness's question tool so the thread shows that it is waiting: `AskUserQuestion` in Claude Code and T3 Code, `request_user_input` in Codex. Put all the context in the question: the PR link, what blocks you, and the options with your recommendation first.

Ask only when you cannot continue alone:

- You cannot prove the change.
- The merge gate cannot pass, and you cannot fix that yourself.
- The next step is outside the grant, including a reply to a human reviewer. Include your draft and a link to the thread it belongs in.
- The goal is ambiguous in a way that changes the result.
- Another PR makes this one obsolete.
- The deploy after the merge failed.

Decide everything else yourself with sensible defaults, and list those decisions in the report.

If no question tool is available, or the tool returns no answer, take the safe path: leave the PR open and unmerged, and start your final message with the question.

## Report

- The PR link, the merge commit, the worktree path if you made one, and the deploy status if there was one.
- Your proof, the evidence on the PR, and the test methods you used under the testing permission.
- The reviews: `pre-pr-review` passes and verdict, or why you skipped it, the route each reviewer of the pair ran on, and bot findings fixed or dismissed with reasons.
- Each decision you made for the user.
- Kernel actions you took, and the ones you are proposing.
- Follow-ups you declined to fold into this PR.
