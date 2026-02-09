---
name: codebase-explorer
description: Read-only architecture mapping and execution tracing for unfamiliar or complex codebases.
---

# Codebase Explorer

## When to use
- You need a read-only understanding of architecture before making changes.
- You must identify entry points, dependencies, and change hotspots.
- You need a concise execution trace for a feature or bug path.

## Inputs expected
- Problem area or feature name.
- Optional starting paths, symbols, or logs.

## Workflow
1. Orient:
- Identify repository structure, entry points, and relevant docs.

2. Map components:
- List key modules and responsibilities.
- Capture data flow: inputs -> transformations -> outputs.

3. Trace execution:
- Follow request/event flow across modules.
- Note side effects, external dependencies, and state transitions.

4. Identify hotspots:
- Propose files most likely to require changes.
- Flag risky coupling or fragile boundaries.

## Output format (evidence required)
- Entry points.
- Key components and responsibilities.
- Execution trace (high-level call chain).
- Candidate change hotspots.
- Risks and foot-guns.

## Quality gate / halt conditions
- Read-only mode: do not modify files.
- Halt and state missing context if no reliable entry point can be identified.
