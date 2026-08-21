---
name: graphify-context
description: Use Graphify safely for codebase architecture, dependency, call-flow, SQL, and other multi-hop relationship questions. Use when a task needs a graph query, path, explanation, graph refresh, worktree-safe Graphify scope, or guidance for Graphify in a repository or multi-project workspace.
---

# Graphify Context

Use Graphify as a relationship index, not as the source of truth. Prefer it
when the question crosses files, modules, data stores, or configuration; use
Serena or direct reads for exact symbols and literals.

## Establish the repository boundary

1. Read the repository's agent instructions and context documentation.
2. Resolve the current Git root with `git rev-parse --show-toplevel`.
3. Keep one graph per Git repository unless the project explicitly defines a
   merged cross-repository corpus.
4. Prefer a checked-in project wrapper such as
   `scripts/agent-context graph ...` over raw Graphify commands. Project
   wrappers define corpus exclusions, freshness rules, and commit policy.

Do not build a graph from a parent directory that merely contains unrelated
repositories. Query each repository's graph separately, then verify and join
the findings in prose. Build a merged graph only for an intentional,
documented cross-repository analysis.

## Handle worktrees correctly

`graphify-out/` is often ignored generated state. It therefore does not appear
automatically in a newly created worktree even when the main checkout has a
graph. Never assume that Graphify is ready merely because its configuration or
hook files followed the branch.

For every worktree that needs a graph:

1. Resolve the worktree's absolute Git root.
2. Run the project's graph freshness check when one exists.
3. Refresh or build the graph in that worktree when it is missing or stale.
4. Query only after the guard passes.

When using Graphify MCP tools, pass the current worktree's absolute path as
`project_path` whenever the tool accepts it. Do not rely on a long-lived MCP
server's default graph; it may point at another repository or worktree.

## Query before browsing broadly

When a current graph exists, ask one focused question at a time:

```sh
graphify query "<architecture or dependency question>" --budget 1800
graphify path "<source concept>" "<target concept>"
graphify explain "<symbol or concept>"
```

Use `query` for a scoped subgraph, `path` for connectivity, and `explain` for
one concept. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture
review. Avoid loading the entire graph or report for a narrow question.

If the repository has a guarded wrapper, use its equivalent commands instead:

```sh
scripts/agent-context graph check
scripts/agent-context graph refresh
scripts/agent-context graph query "<question>" --budget 1800
```

## Refresh deliberately

Use the project wrapper when available. Without one, follow the installed
Graphify skill or CLI help for the current version. A typical incremental
refresh is `graphify update .`; a missing graph requires a full build.

Refresh after a new worktree, a relevant corpus change, altered exclusions, or
a substantial deletion/refactor. If the project fingerprints HEAD or corpus
content, honor that guard even when `graphify query` would otherwise run.

Inspect repository policy before staging generated output. Some teams commit
`graphify-out/` for shared maps; others deliberately keep it reproducible and
untracked. The repository rule wins.

## Interpret and verify

- Treat `EXTRACTED` edges as stronger evidence than `INFERRED` or `AMBIGUOUS`
  edges.
- Verify inferred, surprising, security-sensitive, or high-impact paths in
  current source and canonical docs.
- Cite the decisive files and symbols, not only graph node names.
- Fall back to Serena for definitions/references and to `rg` plus focused reads
  for literal text, prose, configuration, or stale/missing graph output.
- Stop when the evidence is sufficient; do not invoke every retrieval layer by
  default.

If two focused graph attempts miss material evidence and a fallback succeeds,
record the retrieval miss using the repository's measurement workflow when it
has one.
