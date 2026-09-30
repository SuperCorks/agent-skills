# Upstream source

This skill is vendored. It is the agent skill bundled with the BrowserSkill CLI (`bsk`), copied
from bsk 0.3.2. Do not edit it here; refresh it from upstream instead.

To check for a newer version:

1. Update the CLI with `bsk update`, then check `bsk --version`.
2. Reinstall the bundled skill into a scratch location, for example
   `bsk install-skill --harness codex --force`, which writes `~/.agents/skills/browser-skill`.
3. Copy `SKILL.md` and `references/` from there into this folder and update the version above.

`bsk` also refreshes its own installs in `~/.agents/skills` and `~/.claude/skills`. A refresh
that differs from this copy shows up as a local change in those checkouts; update this folder
from it rather than discarding it. The `.bsk-source` and `.bsk.lock` files are bsk's install
state and are not tracked here.
