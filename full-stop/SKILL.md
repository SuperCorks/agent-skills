---
name: full-stop
description: Take a change from its current state to a pull request that is ready for the user to merge, with nobody watching. Same workflow as full-send (finish, prove, review, file, babysit), but never merge. Use when the user says "full stop", including a closing "Full stop." on a change request. Not for unattended delivery through merge (full-send) or for babysitting an existing PR on its own (pr-babysit).
---

# Full Stop

Do the same work as `full-send`, but stop with the PR ready for the user to merge. Never merge it.

Read [full-send](../full-send/SKILL.md) and follow it: its workflow, branch workflow, proof, review, babysitting, waiting, Kernel, and asking rules. A "full stop" request authorizes that work without a separate "full send" request. That includes full-send's testing permission: a "full stop" is the permission for the test methods Proof needs, even when a project file says to ask first. Its merge permission does not apply. The overrides below take precedence.

## No merging

You may commit, push, rebase, resolve conflicts, merge the base into the branch, and use `--force-with-lease` on this task's branch. Never merge the PR, enable auto-merge, add it to a merge queue, push to the default or integration branch, bypass branch protection, or have anyone else do these.

Turn off any auto-merge on the PR and take it out of any merge queue before work begins, and check again before each push. Report these changes. If you cannot prevent an automatic merge, report the blocker before going on.

In a Lovable-managed repo, pushing to the connected branch is the merge. Follow `lovable-workflow` up to that push, then stop with the validated change committed locally and report the commit as ready to push.

## Stop at the gate

Use full-send's merge gate as the readiness check. Replace its merge, wrap-up, and report steps with a handoff. Proof and review must cover the final diff: recheck behavior changes and meaningful conflict fixes before the handoff.

Fetch the base and read the live PR: head, base, checks, reviews, and mergeability. Confirm it is open, not a draft, and not set to merge without the user. If someone else merged it, report that instead.

- **Ready to merge:** the merge gate passes. Leave the PR open and unmerged.
- **Waiting for required approval:** only a required human approval remains. Confirm that this is the actual blocker.
- **Blocked:** explain what prevents readiness, what you tried, and what is needed. Follow full-send's rules for asking the user.

In T3 Code, call `unwatch_pull_request` before the handoff or a question if you watched the PR. For a Kernel task, save the work summary at the handoff, since there is no merge to wait for.

## Handoff report

- The PR link, the final head, and the verdict: ready to merge, waiting for approval, or blocked.
- Whether the PR is still open and unmerged, and any auto-merge or merge-queue change you made.
- Your proof, and the test methods you used under the testing permission.
- The reviews: `pre-pr-review` passes and verdict, or why you skipped it, and bot findings fixed or dismissed with reasons.
- Each decision you made for the user, and the risks that remain.
- Kernel actions you took, and the ones you are proposing.
- Follow-ups you declined to fold into this PR.
