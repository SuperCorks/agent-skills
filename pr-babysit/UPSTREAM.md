# Upstream sources

This skill is adapted, not vendored: edit it freely. Nothing here tracks upstream, and there is no
refresh step. It merges ideas from these files in `cursor/plugins` at commit
`d73344bee8cf22e53b9d5f4cf5749d38ba38c174` (2026-10-09):

- `cursor-team-kit/skills/loop-on-ci/SKILL.md`
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/cursor-team-kit/skills/loop-on-ci/SKILL.md>
- `cursor-team-kit/skills/fix-ci/SKILL.md`
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/cursor-team-kit/skills/fix-ci/SKILL.md>
- `cursor-team-kit/agents/ci-watcher.md`
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/cursor-team-kit/agents/ci-watcher.md>
- `pstack/skills/poteto-mode/playbooks/babysit.md`
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/pstack/skills/poteto-mode/playbooks/babysit.md>
- `pstack/skills/poteto-mode/playbooks/shipping.md` (steps 1-3 and 7)
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/pstack/skills/poteto-mode/playbooks/shipping.md>
- `pstack/skills/poteto-mode/references/bugbot-triage.md`
  <https://github.com/cursor/plugins/blob/d73344bee8cf22e53b9d5f4cf5749d38ba38c174/pstack/skills/poteto-mode/references/bugbot-triage.md>

Left out on purpose: the Origin forge, Graphite, the `watch-pr` script and its verdicts, `/loop`,
Cursor cloud agents, and stack landing (shipping steps 4-9). Bugbot triage is delegated to
`address-pr-comments`.

## Licenses

`cursor-team-kit` is MIT licensed:

    Copyright (c) 2026 Cursor

`pstack` is MIT licensed:

    Copyright (c) 2026 Lauren Tan

Both use the same MIT permission notice:

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
