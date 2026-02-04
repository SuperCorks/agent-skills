#!/usr/bin/env node

/**
 * Reply to PR review comments and post summary comments.
 *
 * Usage:
 *   # Reply to a specific thread comment
 *   npm run gh:pr-reply -- --thread-id <thread-id> --message "Your reply"
 *
 *   # Post a general PR comment (summary)
 *   npm run gh:pr-reply -- --pr-comment --message "Your summary"
 *
 *   # Batch reply from JSON file
 *   npm run gh:pr-reply -- --batch replies.json
 *
 * JSON batch format:
 * {
 *   "threadReplies": [
 *     { "threadId": "PRRT_xxx", "message": "✅ Addressed - fixed in commit abc" }
 *   ],
 *   "prComment": "## Summary\n\n- Fixed X\n- Skipped Y"
 * }
 *
 * Requires: GitHub CLI (gh) to be installed and authenticated.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: "utf-8", ...options }).trim();
  } catch (error) {
    if (options.throwOnError !== false) {
      throw error;
    }
    return null;
  }
}

function getRepoInfo() {
  const remoteUrl = exec("git remote get-url origin");
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
  const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(\.git)?$/);

  const match = sshMatch || httpsMatch;
  if (!match) {
    console.error("❌ Could not parse GitHub repository from remote URL:", remoteUrl);
    process.exit(1);
  }

  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function getCurrentBranchPR() {
  const result = exec("gh pr view --json number --jq .number", {
    throwOnError: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result ? parseInt(result, 10) : null;
}

function replyToThread(owner, repo, threadId, body) {
  const mutation = `mutation AddPullRequestReviewThreadReply($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
      comment {
        id
        url
      }
    }
  }`;

  const tempFile = path.join(os.tmpdir(), `gh-mutation-${Date.now()}.graphql`);

  try {
    fs.writeFileSync(tempFile, mutation);
    const result = exec(
      `gh api graphql -F query=@${tempFile} -F threadId="${threadId}" -F body="${body.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`,
    );
    return JSON.parse(result);
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function postPRComment(owner, repo, prNumber, body) {
  // Use gh pr comment which is simpler for general PR comments
  const tempFile = path.join(os.tmpdir(), `gh-comment-${Date.now()}.md`);

  try {
    fs.writeFileSync(tempFile, body);
    const result = exec(`gh pr comment ${prNumber} --body-file "${tempFile}" -R ${owner}/${repo}`);
    return { success: true, result };
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    threadId: null,
    message: null,
    prComment: false,
    batchFile: null,
    prNumber: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--thread-id" && args[i + 1]) {
      result.threadId = args[++i];
    } else if (arg === "--message" && args[i + 1]) {
      result.message = args[++i];
    } else if (arg === "--pr-comment") {
      result.prComment = true;
    } else if (arg === "--batch" && args[i + 1]) {
      result.batchFile = args[++i];
    } else if (arg === "--pr" && args[i + 1]) {
      result.prNumber = parseInt(args[++i], 10);
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    }
  }

  return result;
}

function main() {
  const opts = parseArgs();
  const { owner, repo } = getRepoInfo();

  let prNumber = opts.prNumber || getCurrentBranchPR();
  if (!prNumber) {
    console.error("❌ Could not detect PR number. Use --pr <number>");
    process.exit(1);
  }

  // Batch mode
  if (opts.batchFile) {
    if (!fs.existsSync(opts.batchFile)) {
      console.error(`❌ Batch file not found: ${opts.batchFile}`);
      process.exit(1);
    }

    const batch = JSON.parse(fs.readFileSync(opts.batchFile, "utf-8"));
    let successCount = 0;
    let errorCount = 0;

    // Process thread replies
    if (batch.threadReplies && Array.isArray(batch.threadReplies)) {
      console.log(`\n📝 Processing ${batch.threadReplies.length} thread replies...\n`);

      for (const reply of batch.threadReplies) {
        try {
          if (opts.dryRun) {
            console.log(`[DRY RUN] Would reply to ${reply.threadId}:`);
            console.log(`   ${reply.message.substring(0, 80)}...`);
          } else {
            const result = replyToThread(owner, repo, reply.threadId, reply.message);
            console.log(`✅ Replied to ${reply.threadId}`);
            if (result.data?.addPullRequestReviewThreadReply?.comment?.url) {
              console.log(`   ${result.data.addPullRequestReviewThreadReply.comment.url}`);
            }
          }
          successCount++;
        } catch (error) {
          console.error(`❌ Failed to reply to ${reply.threadId}: ${error.message}`);
          errorCount++;
        }
      }
    }

    // Post PR summary comment
    if (batch.prComment) {
      console.log(`\n📋 Posting PR summary comment...\n`);
      try {
        if (opts.dryRun) {
          console.log(`[DRY RUN] Would post PR comment:`);
          console.log(batch.prComment.substring(0, 200) + "...");
        } else {
          postPRComment(owner, repo, prNumber, batch.prComment);
          console.log(`✅ Posted PR summary comment`);
        }
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to post PR comment: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Done: ${successCount} succeeded, ${errorCount} failed`);
    return;
  }

  // Single reply mode
  if (opts.threadId && opts.message) {
    console.log(`\n📝 Replying to thread ${opts.threadId}...\n`);

    if (opts.dryRun) {
      console.log(`[DRY RUN] Would reply:`);
      console.log(opts.message);
      return;
    }

    try {
      const result = replyToThread(owner, repo, opts.threadId, opts.message);
      console.log(`✅ Reply posted successfully`);
      if (result.data?.addPullRequestReviewThreadReply?.comment?.url) {
        console.log(`🔗 ${result.data.addPullRequestReviewThreadReply.comment.url}`);
      }
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // PR comment mode
  if (opts.prComment && opts.message) {
    console.log(`\n📋 Posting PR comment...\n`);

    if (opts.dryRun) {
      console.log(`[DRY RUN] Would post:`);
      console.log(opts.message);
      return;
    }

    try {
      postPRComment(owner, repo, prNumber, opts.message);
      console.log(`✅ Comment posted successfully`);
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // Show usage
  console.log(`
Usage:
  # Reply to a specific thread comment
  npm run gh:pr-reply -- --thread-id <thread-id> --message "Your reply"

  # Post a general PR comment (summary)
  npm run gh:pr-reply -- --pr-comment --message "Your summary"

  # Batch reply from JSON file
  npm run gh:pr-reply -- --batch replies.json

  # Dry run (don't actually post)
  npm run gh:pr-reply -- --batch replies.json --dry-run

JSON batch format:
{
  "threadReplies": [
    { "threadId": "PRRT_xxx", "message": "✅ Addressed - fixed in commit abc" }
  ],
  "prComment": "## Summary\\n\\n- Fixed X\\n- Skipped Y"
}
`);
}

main();
