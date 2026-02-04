# Contributing

## Creating a New Skill

1. Create a new folder under `skills/` with your skill name (lowercase, hyphenated)
2. Add a `SKILL.md` file with the skill documentation
3. Add any supporting scripts in a `scripts/` subdirectory

### SKILL.md Format

```markdown
````skill
---
name: your-skill-name
description: 'Brief description of what the skill does'
---

# Skill Name

Detailed documentation and usage instructions...
````
```

### Guidelines

- Keep skills focused on a single domain/tool
- Include clear usage examples
- Document all available commands/scripts
- Use environment variables for configuration where possible
- Output JSON from scripts for easy parsing
