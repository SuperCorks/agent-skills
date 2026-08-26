---
name: change-impact-audit
description: Audit the blast radius of a proposed or implemented code change and test the assumptions that keep it safe. Use when the user asks what could break beyond the diff or requests a focused change-impact assessment.
---

# Change Impact Audit

Assess consequences beyond the changed lines. This is a read-only audit: do not modify product code, tests, configuration, documentation, or repository history. Running normal repository checks is allowed; identify and remove only temporary artifacts created specifically for the audit when safe to do so.

## Anchor the change

- Pin the comparison range or proposed change being assessed. Distinguish committed changes, working-tree changes, and inferred future changes.
- State the intended behavior and compatibility promises. If intent is unclear, report how that limits the verdict.
- Identify changed interfaces, data shapes, state transitions, configuration, dependencies, and side effects rather than relying only on file proximity.

## Trace beyond the diff

Follow each changed contract to its producers and consumers. Check the relevant dimensions, including:

- direct and indirect callers, alternate entry points, background jobs, and event consumers;
- stored data, migrations, serialization, defaults, fixtures, and rollback compatibility;
- public APIs, CLI/UI behavior, integrations, version skew, and deploy ordering;
- caching, retries, idempotency, concurrency, transaction boundaries, and failure recovery;
- authorization, privacy, feature flags, configuration, observability, and operational runbooks;
- generated artifacts, build pipelines, platform variants, and performance-sensitive paths.

Use repository search, dependency or call-flow tools, history, tests, and runtime evidence as appropriate. Absence of a text reference is not proof that a dynamic consumer does not exist.

## Test the safety assumptions

Write down the few assumptions on which safety depends, phrased so they can be disproved. Examples include “all callers accept the new null case,” “old workers can read the new payload,” or “a retry cannot duplicate the side effect.”

For each assumption:

1. Cite the code or contract that makes it relevant.
2. Choose the cheapest meaningful proof: an existing targeted test, a focused repository command, a realistic dry run, schema inspection, or a trace through every consumer.
3. Record the result and its limits.

Prefer real execution when it is safe and inexpensive. Do not add tests or change implementation as part of the audit. Label assumptions `proven`, `supported`, or `unproven`; never turn missing evidence into certainty.

## Report

- Change range, intent, and audit boundaries
- Impact map of affected contracts and downstream consumers
- Safety-assumption ledger with evidence and status
- Risks, ordered by severity and confidence, with trigger, impact, and recommended mitigation
- Cleared concerns, including the evidence that ruled them out
- Validation commands run and concise results
- Unproven facts and the smallest next check needed
- Overall verdict: `safe within audited scope`, `conditional`, or `needs changes`

Do not report generic risks disconnected from the change. A clear concern is as important as a finding: preserve evidence for both.
