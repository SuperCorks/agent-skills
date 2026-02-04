#!/usr/bin/env node

/**
 * Fetches top-level PR review summaries from the current repository.
 * Returns the latest review from each reviewer (automated tools and humans).
 *
 * Usage:
 *   npm run gh:pr-summaries [pr-number]
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

function fetchPRReviewSummaries(owner, repo, prNumber) {
  const query = `query {
    repository(owner: "${owner}", name: "${repo}") {
      pullRequest(number: ${prNumber}) {
        title
        url
        reviews(first: 100) {
          nodes {
            id
            databaseId
            body
            state
            author {
              login
            }
            submittedAt
            url
          }
        }
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
                author {
                  login
                }
                url
              }
            }
          }
        }
      }
    }
  }`;

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

function getLatestReviewPerAuthor(reviews) {
  const latestByAuthor = new Map();

  for (const review of reviews) {
    if (!review.body || review.body.trim() === "") {
      continue;
    }

    const author = review.author?.login || "unknown";
    const existing = latestByAuthor.get(author);

    if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
      latestByAuthor.set(author, review);
    }
  }

  return Array.from(latestByAuthor.values());
}

function parseArgs() {
  const args = process.argv.slice(2);
  let prNumber = null;
  let outputJson = false;

  for (const arg of args) {
    if (arg === "--json") {
      outputJson = true;
    } else if (/^\d+$/.test(arg)) {
      prNumber = parseInt(arg, 10);
    }
  }

  return { prNumber, outputJson };
}

function main() {
  const { prNumber: argPrNumber, outputJson } = parseArgs();
  let prNumber = argPrNumber;

  if (!prNumber) {
    if (!outputJson) {
      console.log("🔍 No PR number provided, detecting from current branch...");
    }
    prNumber = getCurrentBranchPR();

    if (!prNumber) {
      console.error("❌ Could not detect PR number. Please provide it as an argument:");
      console.error("   npm run gh:pr-summaries <pr-number>");
      process.exit(1);
    }
  }

  const { owner, repo } = getRepoInfo();

  if (!outputJson) {
    console.log(`\n📦 Repository: ${owner}/${repo}`);
    console.log(`🔢 PR Number: ${prNumber}\n`);
  }

  try {
    const data = fetchPRReviewSummaries(owner, repo, prNumber);
    const pr = data.data?.repository?.pullRequest;

    if (!pr) {
      console.error(`❌ Could not find PR #${prNumber}`);
      process.exit(1);
    }

    const latestReviews = getLatestReviewPerAuthor(pr.reviews.nodes);
    const unresolvedThreads = pr.reviewThreads.nodes.filter((t) => !t.isResolved);

    if (outputJson) {
      // Output structured JSON for programmatic use
      const output = {
        pr: {
          number: prNumber,
          title: pr.title,
          url: pr.url,
        },
        reviewSummaries: latestReviews.map((r) => ({
          id: r.id,
          databaseId: r.databaseId,
          author: r.author?.login || "unknown",
          state: r.state,
          submittedAt: r.submittedAt,
          url: r.url,
          body: r.body,
        })),
        unresolvedThreads: unresolvedThreads.map((t) => ({
          id: t.id,
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

    // Human-readable output
    console.log(`📝 PR: ${pr.title}`);
    console.log(`🔗 ${pr.url}\n`);

    if (latestReviews.length === 0) {
      console.log("✅ No review summaries found!");
    } else {
      console.log(`📊 Found ${latestReviews.length} reviewer(s) with summaries:\n`);
      console.log("─".repeat(80));

      latestReviews.forEach((review, index) => {
        const author = review.author?.login || "unknown";
        const date = new Date(review.submittedAt).toLocaleString();

        console.log(`\n🆔 ${review.id}`);
        console.log(`👤 @${author} (${review.state})`);
        console.log(`📅 ${date}`);
        console.log(`🔗 ${review.url}`);
        console.log(`\n${review.body.substring(0, 500)}${review.body.length > 500 ? "..." : ""}`);

        if (index < latestReviews.length - 1) {
          console.log("\n" + "─".repeat(80));
        }
      });
    }

    console.log("\n" + "═".repeat(80));
    console.log(`\n📋 Unresolved inline threads: ${unresolvedThreads.length}`);

    if (unresolvedThreads.length > 0) {
      console.log("\n" + "─".repeat(80));
      unresolvedThreads.forEach((thread, index) => {
        const firstComment = thread.comments.nodes[0];
        const author = firstComment?.author?.login || "unknown";

        console.log(`\n🆔 Thread: ${thread.id}`);
        console.log(`   Comment: ${firstComment?.id}`);
        console.log(`📍 ${thread.path}:${thread.line || "?"}`);
        console.log(`👤 @${author}`);
        console.log(
          `💬 ${firstComment?.body?.substring(0, 200)}${(firstComment?.body?.length || 0) > 200 ? "..." : ""}`,
        );

        if (index < unresolvedThreads.length - 1) {
          console.log("\n" + "─".repeat(40));
        }
      });
    }

    console.log("\n" + "─".repeat(80));
    console.log(
      `\n📊 Summary: ${latestReviews.length} review(s), ${unresolvedThreads.length} unresolved thread(s)`,
    );
  } catch (error) {
    console.error("❌ Error fetching PR data:", error.message);
    process.exit(1);
  }
}

main();
