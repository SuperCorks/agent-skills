# Agent Skills

A collection of AI agent skills for GitHub Copilot and other AI assistants.

## Available Skills

| Skill | Description |
|-------|-------------|
| [address-pr-comments](address-pr-comments) | Address PR review comments from CodeRabbit and other reviewers |
| [gtm-manager](gtm-manager) | Manage Google Tag Manager containers, tags, triggers, and variables |

## Installation

### Option 1: Interactive installer (recommended)

Use the `@supercorks/install-skills` CLI to interactively select and install skills:

```bash
npx @supercorks/install-skills install
```

This will:
1. Let you choose the installation path (`.github/skills/`, `.claude/skills/`, or custom)
2. Optionally add the path to `.gitignore`
3. Let you select which skills to install via checkboxes
4. Sparse-clone only the selected skills

### Option 2: Clone specific skills manually

Use Git sparse-checkout to clone only the skills you need:

```bash
# Clone the repo without checking out files
git clone --filter=blob:none --sparse https://github.com/supercorks/agent-skills.git .github/skills
cd .github/skills

# Checkout only the skills you need
git sparse-checkout set address-pr-comments gtm-manager
```

### Option 3: Copy skills to your project

Copy the skill folder to your project's `.github/skills/` directory:

```bash
# From a cloned agent-skills repo
cp -r address-pr-comments /path/to/your/project/.github/skills/
```

## Updating Skills

If you installed using sparse-checkout (Option 1 or 2):

```bash
cd .github/skills  # or wherever you installed
git pull
```

## Skill Structure

Each skill follows this structure:

```
skill-name/
├── SKILL.md          # Main skill documentation (read by AI)
└── scripts/          # Supporting scripts and tools
    ├── lib.js        # Shared utilities
    └── *.js          # Individual command scripts
```

## Adding Skills to Your Project

1. Install skills to `.github/skills/` (or `.claude/skills/` for Claude)
2. The AI agent will automatically discover and use skills from this location
3. Each skill's `SKILL.md` contains the instructions the AI follows

## Creating New Skills

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on creating new skills.

## License

MIT
