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
- local developer workflow: secret sources, required environment variable names, ports, and new setup steps;
- generated artifacts, build pipelines, platform variants, and performance-sensitive paths.

Use repository search, dependency or call-flow tools, history, tests, and runtime evidence as appropriate. Absence of a text reference is not proof that a dynamic consumer does not exist, so also look where symbol search stops:

- consumers keyed by data rather than symbols: API JSON, database columns, wire formats, other languages reading the same bytes, and flag names;
- dependency behavior, read from the library source at the lockfile version plus any local patch or fork;
- execution timing, such as microtasks, effect cleanup, and teardown order.

## Test the safety assumptions

Write down the few assumptions on which safety depends, phrased so they can be disproved. Examples include “all callers accept the new null case,” “old workers can read the new payload,” or “a retry cannot duplicate the side effect.” Most risky-looking changes are safe because of one or two facts: find those, prove them first, and record which risks each one clears.

For each assumption:

1. Cite the code or contract that makes it relevant.
2. Choose the cheapest meaningful proof: an existing targeted test, a focused repository command, a realistic dry run, schema inspection, or a trace through every consumer.
3. Record the result and its limits.

Prefer real execution when it is safe and inexpensive. The usual form is a throwaway script in a temporary directory outside the repository that imports the shipped library version and calls the exact function in question; paste its command and output, then delete it. Do not add tests or change implementation as part of the audit.

Push each assumption as far down this ladder as is cheap, label it with the level reached, and say what stopped it there:

- `asserted`: stated without evidence; treat as unproven;
- `cited`: a specific `file:line` or the pinned library source;
- `traced`: the failure path was walked step by step and cannot be reached;
- `executed`: a script or test calls the real code and would fail loudly if the assumption were wrong;
- `reproduced`: observed in the running application.

Never turn missing evidence into certainty.

## Report

- Change range, intent, and audit boundaries
- Impact map of affected contracts and downstream consumers
- Safety-assumption ledger with evidence and the level each assumption reached
- Risks, ordered by severity and confidence, with trigger, impact, and recommended mitigation
- Cleared concerns, including the evidence that ruled them out
- Validation commands run and concise results
- Before merge: the smallest next check for each unproven fact, and the cheapest test or repro that would catch the most likely real bug
- Overall verdict: `safe within audited scope`, `conditional`, or `needs changes`

Do not report generic risks disconnected from the change. A clear concern is as important as a finding: preserve evidence for both.
