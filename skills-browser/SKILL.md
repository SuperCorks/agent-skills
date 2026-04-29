---
name: skills-browser
description: 'Find useful Agent Skills in curated public skill repositories for a user query. Searches official and community skill repos, ranks matching SKILL.md files, and recommends candidates with source trust notes.'
---

# Skills Browser

Use this skill when the user wants to discover, compare, or source skills from public Agent Skills repositories for a particular domain, framework, workflow, tool, or task.

Examples:

- "Find iOS app skills"
- "Look for security review skills"
- "What skills exist for React Native or Expo?"
- "Find skills for Figma-to-code workflows"
- "Browse community skills for Google Workspace automation"

## What This Skill Does

This skill searches curated `SKILL.md` repositories and returns candidate skills with:

- source repository and trust tier
- skill path and GitHub URL
- parsed skill name and description
- query terms matched
- short reason why the skill matched

It is discovery-oriented. Before installing or copying any third-party skill, inspect the full `SKILL.md`, license, scripts, and bundled files.

## Source Tiers

The default source registry lives at [sources.json](sources.json).

Primary sources:

| Repo | Trust | Best for |
|------|-------|----------|
| `github/awesome-copilot` | high | Copilot community skills, broad discovery |
| `openai/skills` | high | Codex curated skills |
| `anthropics/skills` | high | official Agent Skills reference skills |
| `microsoft/skills` | high | Microsoft and Azure SDK skills |
| `addyosmani/agent-skills` | high | production engineering workflows |
| `Gentleman-Programming/Gentleman-Skills` | medium-high | framework skills, including React Native |

Secondary sources:

| Repo | Trust | Notes |
|------|-------|-------|
| `AgentWorkforce/relay` | medium | agent orchestration and relay workflow skills |
| `dbmcco/claude-agent-toolkit` | medium | integration-heavy Claude skills, especially Google Workspace |
| `sickn33/antigravity-awesome-skills` | low-filtered | huge aggregator; useful for broad discovery and mobile/iOS searches, but validate carefully |
| `alirezarezvani/claude-skills` | low-filtered | broad social-discovered collection; validate carefully |

By default, low-filtered sources are excluded. Add `--include-low-trust` when broad discovery matters more than precision.

## Setup

Prerequisites:

- Node.js 20+
- Network access to GitHub
- Optional `GITHUB_TOKEN` for higher GitHub API limits

Set the skill directory when running from outside the skill folder:

```bash
export SKILLS_BROWSER_DIR=.github/skills/skills-browser
```

## Search Script

Run the bundled search helper:

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "ios app skills"
```

Useful options:

| Option | Purpose |
|--------|---------|
| `--json` | Output machine-readable JSON |
| `--repo owner/name` | Search one repo only |
| `--limit <n>` | Limit result count |
| `--include-low-trust` | Include huge/noisy aggregator sources |
| `--deep` | Scan more skill bodies per repo |
| `--max-repos <n>` | Limit number of configured repos searched |
| `--max-content-per-repo <n>` | Override per-source body scan budget |
| `--source-file <path>` | Use a custom source registry |

## Recommended Workflow

1. Start without low-trust aggregators:

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "react native mobile" --limit 10
```

2. If results are thin, broaden to low-trust aggregators:

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "ios swift xcode app" --include-low-trust --limit 15
```

3. For a known source, search one repo:

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "expo deployment" --repo sickn33/antigravity-awesome-skills --include-low-trust
```

4. Fetch or open the returned GitHub URLs and inspect the skill before recommending installation.

## Example Queries

### iOS / Mobile

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "ios app swift xcode" --include-low-trust --limit 15
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "react native expo mobile" --include-low-trust --limit 15
```

Expected useful sources:

- `sickn33/antigravity-awesome-skills` for iOS, SwiftUI, Expo, React Native, mobile design/security
- `Gentleman-Programming/Gentleman-Skills` for React Native
- `github/awesome-copilot` for Swift MCP adjacent skills

### Security

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "security threat model code review" --limit 15
```

### Figma

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "figma design to code" --limit 15
```

### Google Workspace

```bash
node ${SKILLS_BROWSER_DIR:-.}/scripts/search-skills.js "gmail google sheets workspace" --limit 15
```

## How To Judge Results

Prefer skills that:

- have a clear `name` and specific `description`
- include scoped trigger guidance rather than broad always-on instructions
- avoid unnecessary destructive commands or credential handling
- document required tools, scripts, and environment variables
- come from trusted or curated repositories when several candidates overlap

Be cautious with skills that:

- are from huge aggregators with duplicate or generated-looking entries
- include broad persona instructions instead of task-specific workflow guidance
- request powerful tools without clear constraints
- depend on unknown external scripts or services
- lack license or provenance clarity

## Adding Sources

Add new sources to [sources.json](sources.json) with this shape:

```json
{
  "repo": "owner/name",
  "trust": "medium",
  "sourceType": "community",
  "notes": "Why this source is worth searching.",
  "bestFor": ["domain", "framework"],
  "maxContentScan": 80
}
```

Use `low-filtered` for huge aggregators or unverified social-discovered collections.

## Notes

- The script uses GitHub tree and raw file APIs, not checkout or cloning.
- `GITHUB_TOKEN` is optional but recommended for repeated searches.
- Large repos are scanned with path-first filtering plus a body-scan budget to avoid thousands of raw file requests.
- Results are recommendations for inspection, not automatic installation approval.