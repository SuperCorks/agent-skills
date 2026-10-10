# Upstream source

This skill is vendored from `vercel-labs/agent-skills`, folder `skills/react-best-practices/`, at
commit `063bee94c3f4df8453406c830b0a7df0f2860278` (2026-08-28, skill `metadata.version` 1.0.0):
<https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices>

`rules/` is an unmodified copy (70 rules plus `_sections.md` and `_template.md`). `SKILL.md` has
these local edits:

1. Frontmatter `name` changed from `vercel-react-best-practices` to `react-best-practices` to match
   the folder.
2. Frontmatter `description` narrowed so the skill triggers on performance-minded React or Next.js
   work and explicit best-practice requests, not on every frontend task.
3. The closing "Full Compiled Document" section pointed agents at `AGENTS.md`; it now tells them to
   read the relevant `rules/*.md` files instead.
4. The "Fit the Rules to the Project" section, between the `<!-- local-addition:start -->` and
   `<!-- local-addition:end -->` markers.

Intentionally not copied: `AGENTS.md` (a 108 KB compiled duplicate of `rules/`), `README.md`, and
`metadata.json`.

To refresh:

1. Clone `vercel-labs/agent-skills` into a scratch directory and note the new commit.
2. Replace `rules/` with the upstream `skills/react-best-practices/rules/`.
3. Replace `SKILL.md`, then redo edits 1-3 above and paste back the local-addition section
   unchanged. Check that every rule name it cites still exists in `rules/`.
4. Update the commit, date, and version above.

## License

The upstream repository has no LICENSE file. MIT is stated in its `README.md` ("## License: MIT")
and in this skill's frontmatter (`license: MIT`, `metadata.author: vercel`).
