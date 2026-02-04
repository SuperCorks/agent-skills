# Agent Skills

A collection of AI agent skills for GitHub Copilot and other AI assistants.

## Available Skills

| Skill | Description |
|-------|-------------|
| [gtm-manager](skills/gtm-manager) | Manage Google Tag Manager containers, tags, triggers, and variables |

## Usage

### Option 1: Clone specific skills (recommended)

Use Git sparse-checkout to clone only the skills you need:

```bash
# Clone the repo without checking out files
git clone --filter=blob:none --sparse git@github.com:supercorks/agent-skills.git
cd agent-skills

# Checkout only the skills you need
git sparse-checkout set skills/gtm-manager

# Add more skills as needed
git sparse-checkout add skills/another-skill
```

### Option 2: Copy skills to your project

Copy the skill folder to your project's `.github/skills/` directory:

```bash
# From the agent-skills repo
cp -r skills/gtm-manager /path/to/your/project/.github/skills/
```

### Option 3: Clone entire repo

```bash
git clone git@github.com:supercorks/agent-skills.git
```

## Skill Structure

Each skill follows this structure:

```
skills/
└── skill-name/
    ├── SKILL.md          # Main skill documentation (read by AI)
    └── scripts/          # Supporting scripts and tools
        ├── lib.js        # Shared utilities
        └── *.js          # Individual command scripts
```

## Adding Skills to Your Project

1. Copy or sparse-checkout the skill(s) you need to `.github/skills/`
2. The AI agent will automatically discover and use skills from this location
3. Each skill's `SKILL.md` contains the instructions the AI follows

## Creating New Skills

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on creating new skills.

## License

MIT
