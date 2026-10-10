---
name: bug-diagnosis
description: Diagnose software bugs, flaky failures, and performance regressions to an evidence-backed cause. Use for root-cause investigation; do not implement the fix unless the user also asks for one.
---

# Bug Diagnosis

Find the narrowest cause supported by evidence. Diagnosis may produce a reproducer, measurements, and a proposed correction, but it is not authorization to change product behavior. Copy this workflow's steps into the todo list and leave any step you skip visible as `skip: <reason>`.

## Establish the failure

- Record the observed and expected final state, environment, inputs, and earliest known occurrence.
- Reproduce the issue with the smallest realistic command or interaction available. A repro counts only when the broken state appears twice through the real entry point, with state reset between attempts; inspection may confirm the symptom but must not force it. If reproduction is intermittent, record frequency and conditions instead of treating one pass as proof.
- Check the relevant baseline before attributing the failure to the current change.
- If the failure appears only after a restart or upgrade, check stale persistent state (config, caches, lock files, serialized state) before code.
- Minimize the reproducer by varying one dimension at a time. Preserve any condition whose removal makes the failure disappear.

Before reporting that the issue cannot be reproduced, synthesize the trigger, tighten conditions, or instrument until it fires; ask the user only when you can state why the tools cannot reach the target. If it still does not reproduce, report the attempts and evidence needed next. Do not present a plausible explanation as the cause.

## Investigate

1. Trace the failing path from the observable symptom toward the earliest incorrect state.
2. Form a small set of falsifiable hypotheses, seeded from regression history (`git log -S`, `git bisect`) when the failure is a regression. For each, state the observation that would support it and the observation that would rule it out.
3. Test the cheapest discriminating hypothesis first. Prefer existing logs, focused tests, debuggers, traces, and runtime inspection over broad speculative logging. When two hypotheses or fixes sharing one assumption have failed, write the assumption down and test it directly.
4. Add temporary instrumentation only when existing evidence cannot distinguish the hypotheses. Keep it narrowly scoped and remove only the instrumentation introduced during this investigation before finishing.
5. For performance issues, state the claim in shippable terms (metric, percentile, workload) and compare repeatable measurements under equivalent conditions; do not infer a regression from a single timing. Before reporting a number, check:
   - Runs: at least five per side, alternating A/B, with warm-up or cache state recorded; report the median with range or tail. A gap inside the noise is no difference.
   - Limiter: name what bounds the number (core, lock, disk, network, load generator) from a profile taken outside the reported runs. Load large profiles into a queryable form such as sqlite inside a sub-agent; a frame with no source mapping is not yet a diagnosis.
   - Validity: both sides tuned alike; no errors; no skipped, cached, lazy, or unawaited work; and a gain no larger than the removed work allows.
   - Impact: whether the difference matters end to end.

   Call the result faster, slower, no measurable difference, or inconclusive. It is inconclusive without a named limiter or while errors and skipped work are unchecked.

Never expose secrets, credentials, tokens, private payloads, or unnecessary personal data in commands, logs, traces, screenshots, or the report. Redact sensitive values while retaining the structure needed to diagnose the issue.

## Conclude from evidence

A root cause is established only when evidence connects the symptom to the earliest incorrect decision or state and a discriminating test rules out the main alternatives. A correlation, suspicious line, or failure disappearing after an unrelated restart is not sufficient.

When the user asked only for diagnosis:

- Do not implement the fix, refactor nearby code, or change tests to accept the failure.
- Leave the worktree as it was, apart from user-authored changes and unavoidable tool artifacts.
- Explain the smallest likely correction and its validation criteria without applying it.

When the user also asked for a fix:

- If an existing PR may already fix it, verify that PR instead of writing a competing fix.
- Fix at the earliest incorrect state, not with a guard that hides the symptom. Search for the same pattern elsewhere and fix or report each instance within the authorized scope.
- Ship only lines traced to runtime evidence; revert what a refuted hypothesis motivated.
- Preserve the reproducer as regression coverage when practical, then rerun the discriminating check on the same surface as the repro, plus relevant repository validation. An inconclusive or wrong-surface result is not a pass.

## Report

- Symptom and minimal reproduction
- Root cause, with confidence and exact supporting evidence
- Hypotheses tested and what ruled them in or out
- Performance methodology and results (runs, spread, limiter, verdict), when relevant
- Unknowns or reproduction limits
- Suggested correction and validation criteria
- Files changed, including confirmation that temporary instrumentation was removed
