---
name: github-pr-formatting
description: Open clean PRs with short reviewer briefings and post correctly formatted comments/bodies without escaped newline artifacts.
---

# GitHub PR Formatting Skill

Use this skill whenever creating PRs, editing PR descriptions, or posting multi-line PR comments.

## Goal

Ensure PR titles, bodies, and comments render as proper Markdown and **never** appear with literal escaped sequences like `\n`.

## Core Rules

1. **Always create multi-line PR bodies/comments from a file** (`--body-file` / `--body-file -`).
2. **Never pass escaped newlines inside quoted one-liners** for PR bodies (e.g. avoid `"line1\nline2"`).
3. Write the body as a briefing, not a lab notebook: a reviewer with the diff should understand it in under a minute. Use the sections of the PR Body Template below, in order, and drop any section with nothing to say.
4. Leave out SHAs, rebase history, and file-by-file lists. Never hide a behavior change inside "cleanup".
5. If notes cannot make a PR reviewable, recommend splitting it instead of polishing the description.
6. Run `gh pr view` before stating a PR's status.
7. Before restructuring PR commits (squash, reorder, split), record `git rev-parse HEAD^{tree}`; push only if the rewritten tree matches.

## Safe PR Creation Pattern

### Step 1: Build body in a temp markdown file

```bash
cat > /tmp/pr-body.md <<'EOF'
## Why
Saved filters were lost on reload because they lived only in component state.

## What changed
- Persist filters in the URL query via `useFilterParams`

## Scope
- Covers the orders and customers lists; reports keep local state for now

## Blast radius
Only list pages that opt in to `useFilterParams`; links without query params behave as before.

## Verification
- `npm test -- filters`: passes
- Reloaded `/orders?status=open` locally: the filter persists
EOF
```

### Step 2: Create PR using `--body-file`

```bash
gh pr create \
  --base develop \
  --head feature/my-branch \
  --title "feat(scope): concise title" \
  --body-file /tmp/pr-body.md
```

## Safe Comment Posting Pattern

For multi-line PR comments:

```bash
cat > /tmp/pr-comment.md <<'EOF'
## Update
- addressed X
- deferred Y (reason)
EOF

gh pr comment <pr-number-or-url> --body-file /tmp/pr-comment.md
```

## Single-line Bodies (Allowed)

If a body/comment is truly one line, `--body "..."` is acceptable.

If content is more than one line, use `--body-file`.

## Formatting Checklist (Before Submit)

- [ ] Body written as Markdown file, not escaped string
- [ ] No literal `\n` in command body argument
- [ ] Title follows conventional commits style when appropriate
- [ ] Verification names real run paths and their outcomes
- [ ] Empty sections dropped

## Quick Anti-Patterns (Do Not Use)

- `gh pr create --body "## Why\n- item"`
- `gh pr comment --body "line1\nline2"`
- Very long unstructured paragraph bodies

## Quick Recovery If It Already Happened

If a PR body/comment was posted with literal `\n`:

1. Rebuild a proper markdown file.
2. Update PR body:

```bash
gh pr edit <pr-number-or-url> --body-file /tmp/pr-body.md
```

3. For comments, post a corrected replacement comment with `--body-file`.

## PR Body Template

```markdown
## Why
<problem and approach in 1-3 sentences>

## What changed
- <1-3 bullets; name both sides of a rename>

## Scope
- <what this PR covers and what it deliberately leaves out>

## Tradeoffs
- <only if a real choice was made: the alternative a reviewer would ask about>

## Blast radius
<who or what this touches, and why that is safe or risky>

## Verification
- <real run path>: <outcome; for performance, before -> after with units>

## Review guide
- <optional: core files first, generated files listed separately, deploy order>
```
