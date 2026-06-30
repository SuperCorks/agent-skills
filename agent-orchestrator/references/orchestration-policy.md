# Orchestration Policy

## Core Model

The current thread is the lead agent. External CLI sessions are workers. Workers can investigate, implement, review, or summarize, but the lead agent owns task framing, final integration, user communication, and verification.

Use a bounded loop:

1. Observe: collect enough local context to define a clear subtask.
2. Delegate: send one focused prompt to one worker.
3. Await: wait for the command to complete and capture the result.
4. Integrate: compare the result to local evidence and the user's constraints.
5. Verify: run the necessary checks in the current thread.
6. Decide: either finish, run one more bounded worker, or report a blocker.

## Good Worker Tasks

Good delegated tasks have a narrow output contract:

- "Read these files and explain why this test fails."
- "Review this diff for correctness bugs only."
- "Implement this isolated adapter and report changed files."
- "Research the CLI flags from official docs and provide command examples."

Poor delegated tasks are vague or unbounded:

- "Fix the app."
- "Explore everything."
- "Keep working until it is done."
- "Make whatever changes seem best."

## Handoff Prompt Template

Use this shape when composing worker prompts:

```text
You are a worker agent called by the lead agent.

Task:
<one concrete task>

Working directory:
<absolute path>

Constraints:
- Do not create git worktrees unless explicitly requested.
- Do not start background sessions.
- Preserve unrelated user changes.
- Follow repository instructions such as AGENTS.md.

Expected output:
- Summary
- Evidence with file paths and line numbers where possible
- Files changed, if any
- Commands run and results
- Blockers or assumptions
- Recommended next step
```

## Engine Selection

Use Codex when the desired worker should behave similarly to the current coding environment, use OpenAI/Codex-specific affordances, or perform repository edits with the same local conventions.

Use Claude when an independent model family is helpful, especially for second-opinion review, prose/UX critique, broad synthesis, or comparing interpretations of ambiguous code.

Use OpenCode when the user specifically wants GLM through OpenRouter, when OpenCode's local configuration matters, or when a third model family is useful for a bounded review or implementation pass.

Use multiple engines only when their results will be compared. Do not launch several workers merely because several CLIs exist.

## Loop Limits

Default to one worker pass. Use a second pass only when the first result creates a clear follow-up. Avoid more than two worker passes unless the user explicitly asks for an extended orchestration loop.

When retrying, change one thing at a time: authentication, model, prompt scope, or permissions. If the same environmental failure repeats twice, stop and report the recovery command.

## File And Git Safety

Workers inherit the user's repository. The lead agent must:

- Check git status before and after worker edits.
- Attribute any worker-created files or diffs in the final summary.
- Avoid reverting unrelated user changes.
- Review worker diffs before running broad formatters or tests.
- Keep commits and PRs in the lead thread unless the user explicitly asked a worker to handle them.

## Authentication Handoff

Authentication is allowed to require the user. If `setup` cannot complete login in the current terminal, hand off the exact printed command:

- Codex: `codex login`
- Claude Code: `claude auth login`
- OpenCode/OpenRouter: `opencode auth login openrouter`

After the user completes browser or device-code login, rerun `preflight`. Do not ask the worker to solve missing credentials by inventing tokens or editing credential files.

## Anti-Patterns

- Background workers that the lead does not await.
- Worktrees created "just in case".
- Passing the entire user request to several agents and merging answers without verification.
- Allowing a worker to commit or push without a specific user request.
- Delegating because the task is tedious but not actually separable.
- Treating the worker's final answer as proof.
