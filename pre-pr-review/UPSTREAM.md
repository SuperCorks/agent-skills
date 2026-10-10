# Upstream sources

This skill is adapted, not vendored. Edit it freely; there is nothing to refresh from upstream.

It was written from three plugins in [cursor/plugins](https://github.com/cursor/plugins) at commit
`d73344bee8cf22e53b9d5f4cf5749d38ba38c174`:

- thermos: https://github.com/cursor/plugins/tree/main/thermos
- pstack interrogate: https://github.com/cursor/plugins/tree/main/pstack/skills/interrogate
- dyl-stack dyl-review: https://github.com/cursor/plugins/tree/main/dyl-stack/skills/dyl-review

| Local file | Adapted from |
| --- | --- |
| `SKILL.md` | `thermos/skills/thermos/SKILL.md` and `thermos/agents/*` (parallel two-lens review, reading PR threads only after an independent review); `dyl-stack/skills/dyl-review/SKILL.md` (pin the diff once, reviewers inherit the session model, re-review with a record of skipped asks); `pstack/skills/interrogate/SKILL.md` (optional reviewer from another model family). The loop and its stop rules are local. |
| `references/correctness-lens.md` | `thermos/skills/thermo-nuclear-review/SKILL.md` |
| `references/quality-lens.md` | `thermos/skills/thermo-nuclear-code-quality-review/SKILL.md`, condensed |
| `references/lead-judgment.md` | `pstack/skills/interrogate/references/lead-judgment.md` and the buckets in `pstack/skills/interrogate/SKILL.md` |

Local changes: Cursor-only primitives (Task subagent types, BugBot, plugin loading, model slugs) removed;
reviewers run on the session's own model; all-caps urgency dropped; TypeScript-specific wording generalized
to type escape hatches; Act on / Consider / Noted / Dismissed mapped onto `blocker|warning|nit`.

## License notices

### thermos (`thermos/LICENSE`)

```text
MIT License

Copyright (c) 2026 Cursor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### pstack (`pstack/LICENSE`)

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### dyl-stack (`dyl-stack/LICENSE`)

```text
MIT License

Copyright (c) 2026 Dylan Gattey

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
