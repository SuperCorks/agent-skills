---
name: project-verification-bootstrap
description: Generate and prove a project-local, app-specific verification skill when the user asks to bootstrap, create, or establish a reusable way to drive a repository's real UI, CLI, API, or other user-facing runtime. Do not use for a one-off verification run or merely executing an existing test suite.
---

# Project Verification Bootstrap

Create instructions another agent can use cold to verify real product behavior. Discover the repository's conventions and runtime before writing the generated skill.

Use this workflow only when the user requested a durable project-local verification capability. A request to verify, test, or exercise the current application once does not authorize creating a skill or feature map.

## Boundaries

- Interview the repository first. Ask the user only for facts that cannot be learned safely from source, instructions, configuration, or existing documentation.
- Do not repair product code, change product behavior, or invent missing credentials as part of bootstrapping. Report a broken baseline precisely and request separate authority if a product fix is necessary.
- Use only local, sandbox, test, or otherwise non-destructive targets for the proof run. Do not exercise production writes, purchases, messages to real recipients, or other consequential actions without explicit authorization.
- Preserve user-owned processes, sessions, data, and ports. Never kill by a broad process name or clean a shared directory.

## Discover the verification contract

Read repository instructions and locate any existing project-local skill directory and naming conventions. Prefer that location. If none exists, choose a location supported by the target agent, such as `.agents/skills/verify-<app>/` for Codex or Copilot and `.claude/skills/verify-<app>/` for Claude. If the target agent is unclear, resolve it with the user before creating files rather than guessing an undiscoverable location.

Determine from evidence:

- the primary user surface and any secondary surfaces that matter;
- the repository-supported install, build, seed, and launch commands;
- required configuration, authentication, data, ports, profiles, and working directory;
- an observable readiness condition, not merely a fixed delay;
- existing ways to drive the surface, preferring maintained harnesses and stable handles over coordinates or timing guesses;
- evidence available for both the user-visible result and material side effects;
- whether concurrent instances can be isolated with owned ports, profiles, data directories, namespaces, or fixtures; and
- how to identify and stop only the processes and scratch state created by a verification run.

Resolve conflicting documentation against executable configuration and current source. Record important limitations instead of disguising them as generic instructions.

## Generate `verify-<app>`

Write a valid `SKILL.md` with `name` and a discriminating description grounded in the discovered app and surface. Link its feature index and every supporting reference or helper from the body at the point where a cold agent should read or run it; files that require directory exploration to discover are not part of a reliable workflow. Include exact, repository-specific guidance for:

1. **Launch and readiness**: commands, prerequisites, working directory, instance ownership, readiness probe, and expected signal.
2. **Doctor**: a quick read-only diagnosis that distinguishes an absent, stale, misconfigured, unauthenticated, or wrong-build instance before driving it.
3. **Drive**: the supported interaction method and real routes, selectors, prompts, commands, or request shapes. Exercise public behavior rather than internal setters or test-only shortcuts.
4. **Evidence**: where artifacts go and how to capture the initiating action, resulting state, relevant logs or responses, and durable side effects. A final screenshot alone is insufficient when the behavior changes state.
5. **Isolation**: unique ports, profiles, data paths, fixtures, or namespaces and the conditions under which a shared instance must not be driven.
6. **Cleanup**: stop owned instances by recorded PID, session, container, or equivalent identity; remove only run-owned scratch state; retain evidence.

Commands must be directly runnable and contain no scaffold placeholders. If helpers are genuinely needed, place them inside the generated skill, link them from `SKILL.md`, make their invocation clear, and test them. Run the available skill validator, confirm the folder name and frontmatter name agree, and verify that the target agent can discover the chosen location when its tooling exposes a discovery check.

## Seed a small feature map

Add a feature index linked from `SKILL.md`, plus a small set of files for the most important user-facing capabilities, usually three to five discovered from routes, commands, menus, tests, or docs. Link every feature file from the index. Each feature entry should state:

- what the user can accomplish;
- how the user reaches it;
- how the chosen harness drives it;
- the observable success state and material side effects; and
- feature-specific prerequisites or hazards.

Keep this map about verification entry points and outcomes, not an exhaustive product specification.

## Prove the generated instructions

Run one safe end-to-end proof using only the generated guidance:

1. launch an isolated instance or invocation;
2. confirm the skill metadata and internal links pass, plus the target-agent discovery check when tooling exposes one; otherwise record the manual location check and discovery limitation;
3. run the doctor check;
4. drive one mapped feature through its real user-facing path;
5. capture the declared evidence;
6. clean up what the run created; and
7. confirm the evidence remains and owned processes or scratch state do not.

Clean up after every failed attempt before retrying. If configuration, credentials, a broken baseline, or the absence of any safe path prevents the proof, do not claim completion: report the exact command, failure, observed state, and smallest next decision required from the user.

## Handoff

Report the generated skill location, selected app surface, proof path, exact commands run, evidence location, cleanup result, and any unverified limitations.
