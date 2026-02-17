---
name: github-pr-formatting
description: Open clean draft PRs and post correctly formatted comments/bodies without escaped newline artifacts.
---

# GitHub PR Formatting Skill

Use this skill whenever creating PRs, editing PR descriptions, or posting multi-line PR comments.

## Goal

Ensure PR titles, bodies, and comments render as proper Markdown and **never** appear with literal escaped sequences like `\n`.

## Core Rules

1. **Always create multi-line PR bodies/comments from a file** (`--body-file` / `--body-file -`).
2. **Never pass escaped newlines inside quoted one-liners** for PR bodies (e.g. avoid `"line1\nline2"`).
3. Prefer **draft PRs** unless explicitly asked otherwise.
4. Use concise, structured Markdown sections:
   - `## Summary`
   - `## Validation`
   - `## Scope / Notes` (optional)

## Safe PR Creation Pattern

### Step 1: Build body in a temp markdown file

```bash
cat > /tmp/pr-body.md <<'EOF'
## Summary
- change 1
- change 2
- change 3

## Validation
- npm run lint
- npm test -- <focused-tests>

## Scope / Notes
- out-of-scope note (if needed)
EOF
```

### Step 2: Create draft PR using `--body-file`

```bash
gh pr create \
  --draft \
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
- [ ] Validation commands are listed
- [ ] PR is draft unless user asked for ready-for-review

## Quick Anti-Patterns (Do Not Use)

- `gh pr create --body "## Summary\n- item"`
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

## Canonical Minimal Template

```markdown
## Summary
- <what changed>
- <what changed>

## Validation
- <command>
- <command>
```
