---
name: codebase-explorer
description: Read-only architecture mapping and execution tracing for unfamiliar or complex codebases.
---

# Codebase Explorer

## When to use

- You need a read-only understanding of architecture before making changes.
- You must identify entry points, dependencies, and change hotspots.
- You need a senior-onboarding mental model or concise execution trace for a feature or bug path.

## Inputs expected

- Problem area or feature name.
- Optional starting paths, symbols, or logs.

## Workflow

1. Orient:
   - Identify repository boundaries, entry points, relevant documentation, build/runtime shape, and vocabulary.
2. Build the mental model:
   - Explain the system overview and the few key concepts needed to reason about the requested area.
   - Map module and data ownership, including who creates, mutates, persists, and consumes important state.
3. Trace runtime behavior:
   - Follow the request, event, or command from input through transformations and state transitions to output and side effects.
   - Distinguish confirmed paths from inferences and attach file/symbol evidence.
4. Locate the work:
   - Identify where each responsibility lives, likely change hotspots, affected boundaries, and relevant tests or configuration.
5. Surface gotchas:
   - Call out hidden coupling, lifecycle assumptions, generated code, external dependencies, and fragile boundaries that would surprise a new senior contributor.
6. Separate how from why:
   - Explain **how** the current system works from code and current documentation.
   - Do not infer historical **why** from structure alone. For decision provenance across ADRs, history, tasks, conversations, or analytics, route to `decision-rationale-research`.

## Output format (evidence required)

- Overview and key concepts.
- Runtime flow (high-level call chain and state/data movement).
- Ownership and boundaries.
- Where to look: entry points, files/symbols, tests, configuration, and candidate hotspots.
- Gotchas, risks, and explicit unknowns.
- Evidence references for material claims.

## Quality gate / halt conditions

- Read-only mode: do not modify files.
- Halt and state missing context if no reliable entry point can be identified.
- Label historical rationale as unknown unless supported by direct evidence; use `decision-rationale-research` when the task is primarily a “why” question.
