# Upstream source

Adapted, edit freely. This skill is a local rewrite of upstream ideas, not a vendored copy; there is nothing to refresh.

Sources, from `cursor/plugins` at commit `d73344bee8cf22e53b9d5f4cf5749d38ba38c174`:

- https://github.com/cursor/plugins/tree/main/pstack/skills/arena (frame, fan out, cross-judge, pick, graft, verify)
- https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/eval.md (blinding rules and transcript grading for eval mode)
- https://github.com/cursor/plugins/tree/main/pstack/skills/swarm (declare the selection rule before spawning; a gap does not count as a pass)

Local changes: the Claude vs Codex seat table, with cross-harness seats routed through `agent-orchestrator`; native seats and the judge run on the current thread's model instead of pinned model slugs; the caller entry point (brief, rubric, candidate list in; base, grafts, rationale out); worktree and run-directory handling; transcript grading through `agent-thread-reader`. Dropped: Cursor's Task tool and cloud environment, the `pstack-models` rule, and links to pstack principle skills.

## License notice

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
