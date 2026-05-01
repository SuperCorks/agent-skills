# Agent Skills

A collection of AI agent skills for GitHub Copilot and other AI assistants.

## References
- https://code.claude.com/docs/en/skills
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://developers.openai.com/codex/skills

## Available Skills

| Skill | Description |
|-------|-------------|
| [address-pr-comments](address-pr-comments) | Address PR review comments from automated and human reviewers |
| [architect-planning](architect-planning) | Problem framing and decision-complete implementation planning before code changes |
| [asana-reader](asana-reader) | Read Asana tasks by URL, ID, or name search with multi-account support |
| [boulevard](boulevard) | Query Boulevard APIs, discover availability, book sandbox appointments, and compare or sync services/packages |
| [browserbase](browserbase) | Browserbase browser automation, Fetch/Search, remote auth contexts, UI QA, debugging, tracing, and platform workflows |
| [code-simplifier](code-simplifier) | Behavior-preserving refactor workflow for reducing complexity and improving readability |
| [codebase-explorer](codebase-explorer) | Read-only architecture mapping and execution tracing for unfamiliar or complex codebases |
| [describe-image](describe-image) | Generate a short text description of an image file using AI |
| [docs-maintainer](docs-maintainer) | Update user-facing documentation to match implemented behavior |
| [feature-dev](feature-dev) | Staged workflow for robust feature development from discovery through delivery |
| [frontend-design](frontend-design) | UX and accessibility review guidance for distinctive, usable interfaces |
| [git-workflow-gates](git-workflow-gates) | Branch-state checks and post-documentation PR gate workflow for multi-repo workspaces |
| [github-pr-formatting](github-pr-formatting) | Open clean draft PRs and post correctly formatted comments/bodies |
| [godaddy](godaddy) | Manage GoDaddy domains and DNS records with multi-account API credentials |
| [google-workspace](google-workspace) | Operate Drive, Gmail, Calendar, Sheets, Docs, etc. via the `@googleworkspace/cli` (`gws`) npm package |
| [gtm-manager](gtm-manager) | Manage Google Tag Manager containers, tags, triggers, and variables |
| [implementation-executor](implementation-executor) | Execute an approved implementation plan with focused changes and validation |
| [iterable](iterable) | Read Iterable profiles, profile fields, list users, and user events with multi-account support |
| [pr-review-guidelines](pr-review-guidelines) | Code review rubric focused on correctness, maintainability, consistency, and evidence-backed gates |
| [security-guidance](security-guidance) | Security review checklist for common vulnerabilities with severity and confidence reporting |
| [skills-browser](skills-browser) | Find useful Agent Skills in curated public skill repositories for a user query |
| [slack-reader](slack-reader) | Read Slack messages by permalink URL, including thread replies and resolved user mentions |
| [test-engineer](test-engineer) | Baseline-first testing workflow for correctness and regression safety |
| [vidapp](vidapp) | Query VidApp analytics, purchases, watch history, user tags, collections, and OpenAPI docs |
| [vimeo-ott](vimeo-ott) | Query Vimeo OTT products, customers, videos, live events, browse rows, and analytics |

## Installation

### Option 1: Interactive installer (recommended)

Use the `@supercorks/skills-installer` CLI to interactively select and install skills:

Installer repository: [supercorks/agent-skills-installer](https://github.com/supercorks/agent-skills-installer)

```bash
npx @supercorks/skills-installer
```

If you run into issues with `npx` resolving the executable, use the explicit form:

```bash
npx --package=@supercorks/skills-installer skills-installer install
```

This will:
1. Let you choose global or local installation paths for Copilot, Codex, and Claude
2. Optionally add the path to `.gitignore`
3. Let you select which skills to install via checkboxes, once for all selected install paths
4. Sparse-clone only the selected skills into each selected path

Common skill targets include:

| Harness | Local | Global |
|---------|-------|--------|
| Copilot/Codex | `.agents/skills/` | `~/.agents/skills/` |
| Claude | `.claude/skills/` | `~/.claude/skills/` |

### Option 2: Clone specific skills manually

Use Git sparse-checkout to clone only the skills you need:

```bash
# Clone the repo without checking out files
git clone --filter=blob:none --sparse https://github.com/supercorks/agent-skills.git .agents/skills
cd .agents/skills

# Checkout only the skills you need
git sparse-checkout set address-pr-comments boulevard browserbase describe-image gtm-manager skills-browser
```

### Option 3: Copy skills to your project

Copy the skill folder to your project's `.agents/skills/` directory:

```bash
# From a cloned agent-skills repo
cp -r address-pr-comments /path/to/your/project/.agents/skills/
```

## Updating Skills

If you installed using sparse-checkout (Option 1 or 2):

```bash
cd .agents/skills  # or wherever you installed
git pull
```

## Skill Structure

Each skill follows this structure:

```
skill-name/
├── SKILL.md          # Main skill documentation (read by AI)
├── package.json      # Optional helper script manifest
├── sources.json      # Optional data/config used by helper scripts
├── lib/              # Optional shared utilities
└── scripts/          # Supporting scripts and tools
    └── *.js          # Individual command scripts
```

## Adding Skills to Your Project

1. Install skills to the local or global folder your AI tool reads
2. The AI agent will automatically discover and use skills from this location
3. Each skill's `SKILL.md` contains the instructions the AI follows

## License

MIT
