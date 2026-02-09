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
- Explain what changed, why, and how to use it.
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
