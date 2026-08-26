---
name: merge-conflict-resolution
description: Resolve an active Git merge, rebase, or cherry-pick conflict when the user asks to complete that operation. Do not use for hypothetical conflicts, general branch integration, or conflict prevention advice.
---

# Merge Conflict Resolution

Resolve the in-progress operation by preserving the compatible intent from both sides. Do not invent behavior merely to remove conflict markers.

## Confirm the operation

- Verify from Git state that a merge, rebase, or cherry-pick is active and list every unmerged path.
- Record the starting status and current user changes. Do not touch unrelated modifications.
- Inspect the operation's commits and context. The labels “ours” and “theirs” can reverse practical meaning during a rebase, so determine intent from the base, each staged version, commit history, and surrounding callers rather than from labels alone.

If no supported operation is in progress, stop and explain that this skill does not authorize starting one. Never abort, skip commits, reset history, or force-push unless the user explicitly asks for that action.

## Resolve by intent

For each conflicted file:

1. Inspect the base and both sides, plus relevant commits and non-conflicted neighboring changes.
2. State what each side is trying to preserve: behavior, interface, data shape, tests, or generated output.
3. Resolve each hunk with the smallest coherent combination of those intents. Follow the repository's current structure when one side moved or renamed the surrounding code.
4. Preserve intentional deletions and generated-file conventions. Regenerate artifacts only when the repository's normal workflow requires it.
5. Search for remaining conflict markers and inspect the complete resulting diff before staging the path.

Do not choose one entire side for convenience when the other contains compatible required behavior. Do not add unrelated cleanup. If the intents are genuinely incompatible and the repository does not establish the desired behavior, stop with the exact decision the user must make.

## Validate and continue

- Run the narrowest checks that exercise the reconciled behavior, then the relevant repository validation required by the affected area.
- Review staged and unstaged diffs to ensure only the conflict resolution and pre-existing changes remain.
- Stage resolved paths and continue the same operation. If another conflict appears, repeat the intent analysis for the new set.
- Use non-interactive continuation only to accept the operation's existing commit message, not to silently rewrite it.

Completion means Git no longer reports the requested merge, rebase, or cherry-pick as in progress and relevant validation passes. Do not push unless the user separately requested it, and never force-push under this skill.

## Report

- Operation completed and commits involved
- Conflicted files and the intent retained from each side
- Any user decision or tradeoff required
- Exact validation commands and results
- Final Git status, including unrelated changes left untouched
