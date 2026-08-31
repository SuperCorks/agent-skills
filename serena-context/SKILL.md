---
name: serena-context
description: Use Serena for exact semantic code retrieval, including symbol definitions, references, implementations, outlines, diagnostics, and scoped pattern searches. Use when a task needs worktree-safe Serena activation, indexing, project switching in a multi-repository workspace, or guidance on when to fall back to direct reads or Graphify.
---

# Serena Context

Use Serena for exact semantic code questions. It complements Graphify's
multi-hop relationship map and direct search's literal matching.

## Activate the exact repository or worktree

1. Read the repository's agent instructions and Serena configuration.
2. Resolve the current root with `git rev-parse --show-toplevel`.
3. In an MCP conversation, call Serena's `initial_instructions` when available.
4. Activate the resolved **absolute path**, not only a registered project name.

Use a per-task stdio server that starts unbound:
`serena start-mcp-server --context=codex --open-web-dashboard=false`.
Do not add `--project-from-cwd` globally: desktop task roots may be non-Git
parent workspaces. Explicit activation selects the child/worktree deliberately.
After a configuration change, reconnect the task's MCP server; changing a file
does not switch an already-running server. Verify the active path when moving
between repositories or resuming a task in another worktree.

Absolute activation matters when several linked worktrees intentionally share
one Serena project name. A name can select the wrong checkout; an absolute path
cannot.

In a parent folder containing multiple Git repositories, identify the target
repository first and activate that repository's absolute root. When the task
moves to another repository, switch activation explicitly. Do not treat the
parent collection as one Serena project unless it is a deliberate monorepo with
one semantic boundary.

## Index when needed

Tracked `.serena/project.yml` configuration follows a clone or worktree, while
local language-server caches do not. Activate first and use lazy indexing for
ordinary tasks. Explicitly index when a semantic query needs it, activation
reports missing index data, or a major language/layout change warrants it:

```sh
serena project index "$(git rev-parse --show-toplevel)"
```

For normal edits, the running language server updates its index. Prefer a
project-provided health/index wrapper when one exists.

## Retrieve narrowly

Choose the smallest semantic operation that answers the question:

- `get_symbols_overview` for a file outline.
- `find_symbol` for an exact definition.
- `find_referencing_symbols` for callers and usages.
- `find_implementations` or `find_declaration` for dispatch relationships.
- diagnostics tools for current language-server errors.
- `search_for_pattern` for a scoped free-text or regex query when the symbol is
  unknown.

Ask one focused question per call and narrow the relative path whenever
possible. Read only the smallest relevant body after locating it.

## Respect project policy

Honor the repository's configured tool allowlist, write permissions, ignore
rules, and modes. If the project makes Serena read-only or disables Serena
memories, do not bypass those choices. Serena memory is never a substitute for
canonical project documentation or a dedicated cross-session memory system.

## Verify and fall back

- Current source and canonical docs remain authoritative.
- Use `rg` and focused reads for literal strings, prose, configuration,
  generated files, and evidence outside the language server's scope.
- Use Graphify for multi-file architecture and dependency paths.
- Re-index or restart the language server when references are demonstrably
  stale.
- After two focused semantic attempts with no useful evidence, switch layers
  instead of repeating broad Serena searches.

Do not install hooks that deny ordinary file reads after a fixed count or force
Serena for every read. Configuration, docs, and exact literals are legitimate
direct reads. Use metadata telemetry where available; optionally annotate a
material miss that a fallback resolved. Tool invocation counts alone do not
establish that Serena helped.
