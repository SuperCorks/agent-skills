# Upstream source

This skill is vendored from Corey Haines's `coreyhaines31/marketingskills`, folder `skills/copywriting/`, at
commit `2bf95edb4ebd37198ab7fd18b99ba95c2145ec64` (2026-11-26, skill `metadata.version` 2.3.6):
<https://github.com/coreyhaines31/marketingskills/tree/2bf95edb4ebd37198ab7fd18b99ba95c2145ec64/skills/copywriting>

`SKILL.md` and `references/` are unmodified copies. Intentionally not copied: `evals/` (the upstream test
prompts for the skill).

It belongs to a set vendored together: `copywriting`, `copy-editing`, `cro`, `ai-seo`,
`programmatic-seo`, `marketing-psychology`, `product-marketing` and `aso`. These skills read a
product marketing context file, `.agents/product-marketing.md`, before asking questions; the
`product-marketing` skill writes it. Their "Related Skills" sections also name upstream skills that
are not vendored here (for example `signup`, `ab-testing`, `schema`, `seo-audit`); install those from
upstream if they are needed.

To refresh:

1. Clone `coreyhaines31/marketingskills` into a scratch directory and note the new commit.
2. Replace `SKILL.md` and `references/` with the upstream `skills/copywriting/` copies, without `evals/`.
3. Check the diff for hidden text, commands, and anything that sends, publishes, or reads credentials.
4. Update the commit, date, and version above.

## License

MIT License

Copyright (c) 2025 Corey Haines

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
