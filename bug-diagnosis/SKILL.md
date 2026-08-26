---
name: bug-diagnosis
description: Diagnose software bugs, flaky failures, and performance regressions to an evidence-backed cause. Use for root-cause investigation; do not implement the fix unless the user also asks for one.
---

# Bug Diagnosis

Find the narrowest cause supported by evidence. Diagnosis may produce a reproducer, measurements, and a proposed correction, but it is not authorization to change product behavior.

## Establish the failure

- Record the observed result, expected result, environment, inputs, and earliest known occurrence.
- Reproduce the issue with the smallest realistic command or interaction available. If reproduction is intermittent, record frequency and conditions instead of treating one pass as proof.
- Check the relevant baseline before attributing the failure to the current change.
- Minimize the reproducer by varying one dimension at a time. Preserve any condition whose removal makes the failure disappear.

If the issue cannot be reproduced, report the attempts and evidence needed next. Do not present a plausible explanation as the cause.

## Investigate

1. Trace the failing path from the observable symptom toward the earliest incorrect state.
2. Form a small set of falsifiable hypotheses. For each, state the observation that would support it and the observation that would rule it out.
3. Test the cheapest discriminating hypothesis first. Prefer existing logs, focused tests, debuggers, traces, and runtime inspection over broad speculative logging.
4. Add temporary instrumentation only when existing evidence cannot distinguish the hypotheses. Keep it narrowly scoped and remove only the instrumentation introduced during this investigation before finishing.
5. For performance issues, compare repeatable measurements under equivalent conditions. Include workload, sample count, warm-up or cache state, and a useful distribution such as median and tail latency; do not infer a regression from a single timing.

Never expose secrets, credentials, tokens, private payloads, or unnecessary personal data in commands, logs, traces, screenshots, or the report. Redact sensitive values while retaining the structure needed to diagnose the issue.

## Conclude from evidence

A root cause is established only when evidence connects the symptom to the earliest incorrect decision or state and a discriminating test rules out the main alternatives. A correlation, suspicious line, or failure disappearing after an unrelated restart is not sufficient.

When the user asked only for diagnosis:

- Do not implement the fix, refactor nearby code, or change tests to accept the failure.
- Leave the worktree as it was, apart from user-authored changes and unavoidable tool artifacts.
- Explain the smallest likely correction and its validation criteria without applying it.

When the user also asked for a fix, preserve the reproducer as regression coverage when practical, implement the narrow correction, and rerun the discriminating check plus relevant repository validation.

## Report

- Symptom and minimal reproduction
- Root cause, with confidence and exact supporting evidence
- Hypotheses tested and what ruled them in or out
- Performance methodology and results, when relevant
- Unknowns or reproduction limits
- Suggested correction and validation criteria
- Files changed, including confirmation that temporary instrumentation was removed
