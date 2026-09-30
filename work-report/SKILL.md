---
name: work-report
description: Report what was done on a project over a date range by reading GitHub, Kernel, Slack, and local agent threads together, grouped by theme with links to tasks, PRs, and artifacts. Use when asked what happened, what was done, or what shipped since a date, for a weekly recap, a client update, or a standup brief. Not for planning future work or reviewing a single diff.
---

# Work Report

Produce one narrative report of what actually happened on a project in a period, drawn from every
source at once. The value is the synthesis: a reader should learn what changed, what it means, and
what is still open, without opening any of the sources.

This skill is read-only. Never close tasks, comment, push, or publish as part of a report.

## 1. Resolve the window

The period is never guessed. If the request does not name one, ask once with shortcuts:

- since Monday (the most recent past Monday)
- the last 7 days
- since the last report for this project (from the state file below)
- a custom range

Interpret relative phrasing against today's date. Treat the window as inclusive of both ends and
report dates in the user's local time.

After a successful report, record the window in `~/.agents/state/work-report.json`, keyed by
project root: `{"<project root>": {"lastRunAt": "<ISO>", "windowEnd": "<YYYY-MM-DD>"}}`. Create the
directory and file when missing. This only powers the "since the last report" shortcut.

## 2. Resolve scope silently

Do not interview the user about scope. Infer it, then state what was covered in the footnote.

- **Repositories**: Git repos in the working directory and its sibling project directories. Read
  the workspace `AGENTS.md` for the project layout and any rules about which directories matter.
- **Kernel organization**: the org named in `AGENTS.md`, otherwise the org whose name matches the
  project, resolved through `GET /organizations`.
- **Slack channels**: channels whose name contains the project slug, plus any channel IDs appearing
  in Kernel task notes or comments for that org. Confirm the ID before reading history.
- **Agent threads**: local Codex, Claude Code, and T3 Code stores, filtered to the project path.

## 3. Collect in parallel

Fan out one sub-agent per source so a report takes minutes, not tens of minutes. Each returns
findings, not raw dumps. Read enough to state outcomes: Kernel work notes and Slack bodies carry
the results, while titles alone only say that something was touched.

**GitHub.** Per repo: `git log --all --since=<from> --until=<to> --date=short --format='%ad %an %s'`
after `git fetch`, plus `gh pr list --state merged --json number,title,mergedAt,author` and release
tags. Fetch PR bodies only for the few PRs that anchor a theme.

**Kernel.** `GET /tasks?organizationId=<org>&limit=200`, filtered to tasks whose `updatedAt` or
`completedAt` falls in the window, then `GET /tasks/{id}/work-notes` and `/comments` for the ones
that carry results. Work notes are where investigations record their numbers.

**Slack.** Use the `slack-reader` skill: `conversation-history.js --channel <id> --oldest <ISO>
--order asc`. Capture client requests, decisions, and anything reported back. Resolve user IDs to
names when it matters to the sentence.

**Agent threads.** Run `scripts/local-threads.sh <since> <match>` from this skill. It reports T3
Code threads (with `t3cork://` links), Claude Code sessions, and Codex sessions touching the
project. Prefer it over the slower `agent-thread-reader` sweep.

## 4. Verify cheap facts

Before writing, confirm the claims that a reader would act on, using reads only:

- Did merged work actually ship? Check release tags and the latest deployment run.
- Do published artifact links still load? A `curl -sI` status is enough.
- Does a "fixed" item match current state, when a single API read can tell you?

Report what you could not verify rather than implying it works.

## 5. Write the report

Lead with the story, not the sources. Group by theme, ordered by importance, not chronologically.

Required sections:

- **Headline theme.** One `##` section naming the dominant thread of the period, stated as a
  finding: "Launch prep for the new location dominated the week". Follow with the concrete pieces.
- **Other themes.** One `##` each, same treatment. Merge related work across repos into one theme;
  a CMS tab, its API, and its published app belong together.
- **In-flight and open.** Active work, blockers, risks, and dates that matter. Say what is needed
  and from whom.
- **Sources footnote.** Short, human-readable, at the end: which repos, channels, Kernel org, and
  thread stores were read, the window, and any real caveat. A few lines, not an inventory.

Include when the period has them:

- **Investigations with results.** The question asked and the answer found, with the numbers that
  settled it. An investigation without its result is not worth a line.
- **Shipped.** Releases and versions when a reader needs to know what is live.

Writing rules:

- Every item earns its line by saying what changed or what was learned. Drop routine chores.
- Attribute work by others ("PR #171 by David"). Leave the user's own work unattributed.
- Never list raw commits. Collapse them into outcomes. Ignore Lovable bot commits entirely
  (`gpt-engineer-app[bot]`, `Lovable`, and messages like "Changes" or "Work in progress"); report
  only the outcome those commits produced.
- Keep customer and staff names when they carry the finding. Flag any link that is publicly
  readable so the user knows before forwarding it.
- State plainly what a source could not tell you.

## 6. Link everything a reader would open

Harvest URLs from Kernel notes, Slack messages, and PR bodies inside the window, and attach each to
the item it belongs to. Formats:

- Kernel task: `https://app.krnl.work/t/NW-336` (use the task `key`, never a UUID)
- Pull request: the repository PR URL, written as `#417` in prose
- T3 Code thread: `t3cork://app/<environment-id>/<thread-id>`, where the environment ID is
  `~/.t3-fork/userdata/environment-id`
- Slack: permalinks for requests and decisions only, not routine chatter
- Artifacts: published reports, storefront previews, Lovable apps, dashboards, live booking links

## Output

Deliver the report in chat as Markdown. Write it to a file or publish it only when asked.

## Format example

An invented project, showing the shape rather than the length:

```markdown
# Northwind: Mon Sep 14 → Tue Sep 22

## Headline: Launch prep for the Harbor Street location dominated the week
- **Storefront**: Harbor Street added to the locations page with a map, and the landing page moved
  to `/pages/welcome-harbor` (PR #171 by Dana).
- **Early-access booking flow** ([NW-338](https://app.krnl.work/t/NW-338)): a Harbor Street-only
  flow, shared in Slack as an invite link, released in v4.24.0.

## The CMS became the place to manage booking content
Three features landed in sequence, each pairing a booking-app API with a CMS tab: location badges
(#397), invite links (#401), and referral links (#417).

## Investigations
- **Why the dashboard and the finance sheet disagree**: 131 of 138 bookings matched. The gap is
  first-touch attribution and cancellations, not missing data.
  [Report](https://…/dashboard-vs-finance-sheet.html) — public link, names customers.

## In-flight and open
- **Blocker for Sep 28**: the booking provider needs staff and bookable availability at Harbor
  Street for Sep 28 – Oct 5 ([NW-336](https://app.krnl.work/t/NW-336)).

---
Read: 6 repos under `~/projects/northwind`, Kernel org Northwind (21 tasks), Slack `#northwind`,
and local T3/Claude/Codex threads, for Sep 14–22. Work done inside another project's thread would
not appear here.
```

## Pitfalls

- Reporting activity instead of outcomes. "Updated the dashboard" says nothing; what changed for
  whom does.
- Letting one loud source dominate. A day of Slack chatter is not a theme; a shipped feature is.
- Padding the footnote into an audit log. Keep it to the few lines a reader needs to trust the report.
- Repeating a task title as a finding. Open the work note and report what it concluded.
