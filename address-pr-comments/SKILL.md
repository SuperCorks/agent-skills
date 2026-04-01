---
name: address-pr-comments
description: Address PR review comments from automated and human reviewers. Use this when asked to address PR comments, fix PR feedback, or respond to code review.
---

# Address PR Review Comments

This skill guides you through addressing PR review comments systematically.

## ⚠️ Critical: Only Address the LATEST Review from EACH Reviewer

**Address only the MOST RECENT review from each reviewer.** If there are 3 reviewers (e.g., an automated reviewer, human reviewer A, human reviewer B), you address 3 reviews — the latest one from each.

**Do NOT address:**

- Earlier reviews from the same reviewer (even if threads appear "unresolved")
- "Duplicate comments" sections (these reference old unfixed issues — they'll be re-raised in new reviews if still relevant)
- Threads opened in previous reviews that weren't part of a reviewer's latest review

**Why?** Earlier reviews may contain:

- Feedback that was already addressed
- Suggestions the reviewer reconsidered
- Issues that are no longer relevant after code changes

The `pr-review-summaries.js` script automatically filters to show only the most recent review per author. Trust this output and ignore older feedback.

## Workflow

### Step 1: Gather PR Comments

Run the review summaries script to get the latest feedback:

```bash
# Get the LATEST review summary from each reviewer (automated tools and humans)
# Earlier reviews are ignored - only the most recent per author is returned
node .github/skills/address-pr-comments/pr-review-summaries.js --json > /tmp/pr-summaries.json
```

**What to address from the review summary:**

- ✅ "Actionable comments" — these are the main issues to fix
- 🔁 "Nitpick comments" — optional improvements, skip with reason if not addressing
- ❌ "Duplicate comments" — DO NOT address these; they're references to older unfixed issues

### Step 2: Analyze and Categorize

Parse the review summary JSON and categorize the **actionable comments** only:

**Categories:**

- **Address**: Valid issues that should be fixed
- **Skip**: Issues that are intentional, already fixed, or not applicable

**Skip Reasons:**

- Intentional design decision
- Already addressed in another commit
- False positive from automated reviewer
- Outside scope of this PR
- Breaking change that needs separate PR

**Do NOT include in your analysis:**

- "Duplicate comments" — these are old issues, not new feedback
- Unresolved threads from previous reviews

### Step 3: Confirm Plan with User (MANDATORY)

Before making any code changes, present a confirmation summary to the user with two sections:

- **Will Address**: each item you plan to fix
- **Will Skip**: each item you will not address, with a short reason

Use this format:

```md
## PR Review Plan

### ✅ Will Address
- [comment summary 1]
- [comment summary 2]

### 🔁 Will Skip
- [comment summary 3] — [reason]
- [comment summary 4] — [reason]

Please confirm: proceed with these changes?
```

Then **wait for explicit user approval** before continuing.

Valid approval examples:

- "yes"
- "approved"
- "proceed"
- "go ahead"

### Auto-approval exception

You may skip the wait step only if the user explicitly requests auto approval in the prompt (for example: "auto-approve", "no confirmation needed", or "proceed without asking").

### Step 4: Make Changes

For each item to address:

1. Read the relevant file
2. Apply the fix
3. Note the change made

### Step 5: Commit, Push, and Verify

```bash
git add -A
git commit -m "fix: address PR review comments

- Item 1 description
- Item 2 description
..."
git push
```

This is a hard gate before any PR replies are posted.

- Do not reply to review threads before the fix commit is pushed to the PR branch.
- Do not post the final PR summary comment before the push completes.
- If you mention a fix in a reply, make sure the reviewer can fetch it from the remote branch immediately.
- If you made changes, verify the push succeeded before continuing.

### Step 6: Reply to Thread Comments (Optional)

Only do this after Step 5 is complete and the branch is up to date on the remote.

If the review summary JSON includes `unresolvedThreads` from the latest review, reply to those threads:

**Addressed format:**

```
✅ Addressed - [brief description of fix]
```

**Skipped format:**

```
🔁 Skipped - [reason]
```

Create a batch file and post replies:

```bash
cat > /tmp/replies.json << 'EOF'
{
  "threadReplies": [
    { "threadId": "PRRT_xxx", "message": "✅ Addressed - awaited refetch and moved setRefreshing to finally block" },
    { "threadId": "PRRT_yyy", "message": "🔁 Skipped - intentional design: we want immediate feedback" }
  ],
  "prComment": null
}
EOF

node .github/skills/address-pr-comments/pr-reply.js --batch /tmp/replies.json
```

**Note:** Only reply to threads listed in `unresolvedThreads` from the review summary output. Do NOT use `pr-comments.js` separately — it may return threads from older reviews.

### Step 7: Post Summary Comment

Only do this after Step 5 is complete and any referenced fixes are already pushed.

Post a summary comment covering only the **latest review's** actionable comments and nitpicks:

```bash
node .github/skills/address-pr-comments/pr-reply.js --pr-comment --message "## PR Review Response

### ✅ Addressed
- [list of addressed items with file:line references]

### 🔁 Skipped
- [list of skipped items with reasons]

### 📋 Notes
- [any additional context]
"
```

## Important Notes

1. **Only the LATEST review matters**: Ignore "duplicate comments", unresolved threads from old reviews, and any feedback not in the most recent review summary
2. **Thread IDs**: Use the `id` field from thread objects (format: `PRRT_...`)
3. **Review Summaries**: These don't have thread IDs, so they can only be addressed in the final summary comment
4. **Keep replies brief**: One line for addressed items, one line + reason for skipped
5. **Batch operations**: Always use `--dry-run` first to verify before posting
6. **Approval gate**: Do not start implementing fixes until the user confirms the Step 3 plan, unless explicit auto-approval was requested
7. **Push before replying**: After making changes, commit and push first; only then reply to review threads or post the PR summary comment
