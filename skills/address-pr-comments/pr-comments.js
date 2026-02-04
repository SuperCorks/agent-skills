#!/usr/bin/env node

/**
 * Fetches PR review comments from the current repository.
 *
 * Usage:
 *   npm run gh:pr-comments [options] [pr-number]
 *
 * Options:
 *   --resolved    Show only resolved comments
 *   --unresolved  Show only unresolved comments (default)
 *   --all         Show all comments (both resolved and unresolved)
 *   --json        Output as JSON (for programmatic use)
 *
 * If no PR number is provided, it will try to detect it from the current branch.
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
  // Get remote URL and parse owner/repo
  const remoteUrl = exec("git remote get-url origin");

  // Handle SSH format: git@github.com:owner/repo.git
  // Handle HTTPS format: https://github.com/owner/repo.git
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
  // Try to get PR number for current branch using gh cli
  const result = exec("gh pr view --json number --jq .number", {
    throwOnError: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result ? parseInt(result, 10) : null;
}

function fetchPRComments(owner, repo, prNumber) {
  const query = `query {
    repository(owner: "${owner}", name: "${repo}") {
      pullRequest(number: ${prNumber}) {
        title
        url
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            path
            line
            comments(first: 10) {
              nodes {
                id
                databaseId
                body
                url
                author {
                  login
                }
              }
            }
          }
        }
      }
    }
  }`;

  // Write query to a temp file to avoid shell quoting issues
  const tempFile = path.join(os.tmpdir(), `gh-query-${Date.now()}.graphql`);

  try {
    fs.writeFileSync(tempFile, query);
    const result = exec(`gh api graphql -F query=@${tempFile}`);
    return JSON.parse(result);
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function formatComment(body) {
  // Clean up the comment body - preserve newlines for readability
  return body.trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let filter = "unresolved"; // default
  let prNumber = null;
  let outputJson = false;

  for (const arg of args) {
    if (arg === "--resolved") {
      filter = "resolved";
    } else if (arg === "--unresolved") {
      filter = "unresolved";
    } else if (arg === "--all") {
      filter = "all";
    } else if (arg === "--json") {
      outputJson = true;
    } else if (/^\d+$/.test(arg)) {
      prNumber = parseInt(arg, 10);
    }
  }

  return { filter, prNumber, outputJson };
}

function main() {
  // Parse arguments
  const { filter, prNumber: argPrNumber, outputJson } = parseArgs();
  let prNumber = argPrNumber;

  if (!prNumber) {
    if (!outputJson) {
      console.log("🔍 No PR number provided, detecting from current branch...");
    }
    prNumber = getCurrentBranchPR();

    if (!prNumber) {
      console.error("❌ Could not detect PR number. Please provide it as an argument:");
      console.error("   npm run gh:pr-comments <pr-number>");
      process.exit(1);
    }
  }

  const { owner, repo } = getRepoInfo();
  if (!outputJson) {
    console.log(`\n📦 Repository: ${owner}/${repo}`);
    console.log(`🔢 PR Number: ${prNumber}\n`);
  }

  try {
    const data = fetchPRComments(owner, repo, prNumber);
    const pr = data.data?.repository?.pullRequest;

    if (!pr) {
      console.error(`❌ Could not find PR #${prNumber}`);
      process.exit(1);
    }

    if (!outputJson) {
      console.log(`📝 PR: ${pr.title}`);
      console.log(`🔗 ${pr.url}\n`);
    }

    // Filter threads based on the --resolved/--unresolved/--all flag
    let filteredThreads;
    let filterLabel;
    if (filter === "resolved") {
      filteredThreads = pr.reviewThreads.nodes.filter((t) => t.isResolved);
      filterLabel = "resolved";
    } else if (filter === "all") {
      filteredThreads = pr.reviewThreads.nodes;
      filterLabel = "all";
    } else {
      filteredThreads = pr.reviewThreads.nodes.filter((t) => !t.isResolved);
      filterLabel = "unresolved";
    }

    // JSON output mode
    if (outputJson) {
      const output = {
        pr: {
          number: prNumber,
          title: pr.title,
          url: pr.url,
        },
        filter: filterLabel,
        threads: filteredThreads.map((t) => ({
          id: t.id,
          isResolved: t.isResolved,
          path: t.path,
          line: t.line,
          comments: t.comments.nodes.map((c) => ({
            id: c.id,
            databaseId: c.databaseId,
            author: c.author?.login || "unknown",
            body: c.body,
            url: c.url,
          })),
        })),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (filteredThreads.length === 0) {
      if (filter === "all") {
        console.log("✅ No comments found!");
      } else if (filter === "resolved") {
        console.log("✅ No resolved comments!");
      } else {
        console.log("✅ No unresolved comments!");
      }
      return;
    }

    const totalThreads = pr.reviewThreads.nodes.length;
    const resolvedCount = pr.reviewThreads.nodes.filter((t) => t.isResolved).length;
    const unresolvedCount = totalThreads - resolvedCount;

    console.log(
      `📊 Summary: ${resolvedCount} resolved, ${unresolvedCount} unresolved (${totalThreads} total)`,
    );
    console.log(`🔍 Showing: ${filteredThreads.length} ${filterLabel} comment thread(s)\n`);
    console.log("─".repeat(80));

    filteredThreads.forEach((thread, index) => {
      const firstComment = thread.comments.nodes[0];
      const author = firstComment?.author?.login || "unknown";
      const body = firstComment?.body || "";
      const statusIcon = thread.isResolved ? "✓" : "○";

      console.log(`\n${statusIcon} 🆔 ${thread.id}`);
      console.log(`📍 ${thread.path}:${thread.line || "?"}`);
      console.log(`👤 @${author}`);
      console.log(`💬 ${formatComment(body)}`);

      // Show reply count if there are more comments
      if (thread.comments.nodes.length > 1) {
        console.log(`   ↳ +${thread.comments.nodes.length - 1} more replies`);
      }

      if (index < filteredThreads.length - 1) {
        console.log("\n" + "─".repeat(80));
      }
    });

    console.log("\n" + "─".repeat(80));
    console.log(
      `\n📊 Displayed: ${filteredThreads.length} ${filterLabel} thread(s) of ${totalThreads} total`,
    );
  } catch (error) {
    console.error("❌ Error fetching PR comments:", error.message);
    process.exit(1);
  }
}

main();
