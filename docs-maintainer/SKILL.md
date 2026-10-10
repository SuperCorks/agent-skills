---
name: docs-maintainer
description: Updates user-facing documentation to match implemented behavior, including scoped roadmap maintenance.
---

# Docs Maintainer

## When to use
- Behavior changes need accurate user/contributor documentation updates.
- You need scoped README/config/usage updates tied to delivered work.

## Inputs expected
- Final implemented behavior.
- Acceptance criteria and user-facing deltas.
- Existing documentation structure and tone.

## Workflow
1. Determine doc impact:
- Identify files that must change (README, feature docs, config docs, examples).

2. Update docs:
- Explain what changed, why, and how to use it, putting each part in a document of the matching Diátaxis mode (tutorial, how-to, reference, or explanation).
- Keep one mode per document; split and link rather than mixing. Name how-tos by the task.
- Make reference mirror the structure of what it describes, and generate it from code where possible.
- Use real symbol, flag, file, and command names.
- Make every count or tree claim true at the commit, and include the command that regenerates it.
- Keep wording concise and user-focused.

3. Maintain roadmap (if present):
- Default to features.md
- Move completed items to completed section.
- Remove implemented items from backlog.
- Add newly discovered backlog items only when justified.

## Output format (evidence required)
- Docs updated (files).
- Summary of section-level changes.
- Remaining documentation gaps (if any).

## Quality gate / halt conditions
- Halt if required behavior details are missing or unverified.
- Do not claim guarantees not backed by implementation.
