# Upstream source

Adapted, edit freely. This skill is a local rewrite of upstream ideas, not a vendored copy; there is nothing to refresh.

Sources, from `cursor/plugins` at commit `d73344bee8cf22e53b9d5f4cf5749d38ba38c174`:

- https://github.com/cursor/plugins/tree/main/pstack/skills/reflect (`SKILL.md` and `references/`: the three reviewer lenses, the synthesizer tests and output format)
- https://github.com/cursor/plugins/tree/main/pstack/skills/automate-me (the rule to promote only patterns seen in two or more history slices)
- https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/workflow-from-chats (preference atoms and the strong, medium, weak, contradicted confidence scale)

Local changes: transcripts come from `agent-thread-reader`; reviewers run on the current thread's model instead of pinned model slugs; the three reviewer prompts share one rules section; Cursor's `create-skill`, devex tracker, principle-skill links, and `.cursor` paths are dropped; routing targets are this repo, AGENTS.md (proposal only), and ai-memory (on request); multi-session mode and preference mining are added.

## License notices

`pstack/LICENSE`:

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

`cursor-team-kit/LICENSE`:

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
