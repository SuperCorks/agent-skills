# Upstream source

This skill is adapted, not vendored. Edit it freely; there is nothing to refresh from upstream.

It was written from `skills/full-send/` in [t3dotgg/tstack](https://github.com/t3dotgg/tstack) at commit
`1085050f3baed1ac724caa4a8166145fb2ac88af` (2026-10-27):
<https://github.com/t3dotgg/tstack/tree/1085050f3baed1ac724caa4a8166145fb2ac88af/skills/full-send>

| Local file | Adapted from |
| --- | --- |
| `SKILL.md` | `skills/full-send/SKILL.md`. The waiting rules also draw on `skills/babysit-pr/SKILL.md`, and the PR-filing step on `skills/file-pr/SKILL.md`. |
| `agents/openai.yaml` | `skills/full-send/agents/openai.yaml`, with "review" added to the short description |

Upstream's skills were swapped for local ones:

| tstack | Here |
| --- | --- |
| `sol-loop` (a GPT Sol reviewer in a loop) | `pre-pr-review` (two reviewers on the session's model, at most three passes), run when the agent judges the diff warrants it |
| `file-pr` | `github-pr-formatting` |
| `babysit-pr` and its `pr-wait` script | `pr-babysit` (threads through `address-pr-comments`), with T3's `watch_pull_request` when it is available |
| `leaving-pr-comments` | `github-pr-formatting` comment patterns and `my-voice` |

Local additions:

- What the grant does not cover: messages to people, production changes, and deletions.
- Overrides for the ask-first guardrails in `pre-pr-review` and `pr-babysit`. Their other guardrails stay.
- Proof through `test-engineer`, a project-local `verify-<app>` skill, and `web-computer-use`, with screenshots uploaded to the PR or hosted with `publish-artifacts`.
- Waiting only for the reviewers a repo uses, and one bounded wait for bots that review without a check.
- A branch workflow section: always work from the latest base, follow the update and merge workflow the repo documents, and squash-merge by default.
- When `pre-pr-review` runs, the merge gate requires it to leave no open findings.
- Lovable-managed repos deliver by pushing to the connected branch, and publishing stays with the user.
- Kernel presets: `yolo` actions run as they come up, and `ask` actions go into the report as proposals.
- Merge-triggered deploys get a status check, and a failed deploy is a question for the user.

The `full-stop` variant, which stops before the merge, is its own skill in `full-stop/`.

Left out on purpose: upstream's `pr-wait` script (its Greptile and Macroscope gating does not match these repos), the "smallest change that works" wording (the Ponytail ladder was declined on 2026-10-10), and the PR-body model attribution line (the harness adds its own).

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
