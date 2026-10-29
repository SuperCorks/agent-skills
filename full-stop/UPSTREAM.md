# Upstream source

This skill is adapted, not vendored. Edit it freely; there is nothing to refresh from upstream.

It was written from `skills/full-stop/` in [t3dotgg/tstack](https://github.com/t3dotgg/tstack) at commit
`1085050f3baed1ac724caa4a8166145fb2ac88af` (2026-10-27), the same commit `full-send` came from:
<https://github.com/t3dotgg/tstack/tree/1085050f3baed1ac724caa4a8166145fb2ac88af/skills/full-stop>

| Local file | Adapted from |
| --- | --- |
| `SKILL.md` | `skills/full-stop/SKILL.md` |
| `agents/openai.yaml` | `skills/full-stop/agents/openai.yaml`, unchanged |

It depends on the local `full-send`, so install both together.

Local changes:

- The description says what the skill does, and keeps upstream's trigger on a closing "Full stop." only for a change request.
- Merging the base into the branch is allowed, in line with full-send's branch workflow.
- Lovable-managed repos stop with the validated change committed locally, because pushing to the connected branch is the merge there.
- Kernel tasks get their work summary at the handoff, since there is no merge.
- The handoff report also lists auto-merge and merge-queue changes, Kernel actions, and declined follow-ups.

## License

`tstack` is MIT licensed:

```text
MIT License

Copyright (c) 2026 Theo Browne

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
