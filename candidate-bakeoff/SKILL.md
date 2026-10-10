---
name: candidate-bakeoff
description: Give one brief to several independent candidates, by default one Claude and one Codex, judge their results blind against a rubric the candidates never see, then build on the strongest base and graft the best parts of the others in by hand. Eval mode blind-tests a skill or prompt variant and grades it from transcripts. Use only when the user asks for a bakeoff, Claude vs Codex attempts, competing designs or implementations, or a blind test of a skill change, or when architect-planning offers it for a one-way-door design; not for tasks one attempt settles or for splitting work across workers (agent-conductor).
---

# Candidate Bakeoff

One attempt at a non-trivial artifact can lock in the wrong shape. Run independent attempts at the same brief, judge them against a hidden rubric, and build the result from the best one. Each candidate costs a full attempt; two or three is usually enough.

## Entry point

- **Inputs:** a brief (the artifact to produce, grounding to read, constraints), a rubric of 3 to 6 gradeable criteria, and a candidate list (default: Claude vs Codex). Derive a missing rubric from what success means for this task. Callers such as `architect-planning` pass these three.
- **Output:** the synthesized artifact plus a synthesis note naming the chosen base, each graft and its source, rejected ideas, dropouts, the judge's verdict, and the verification result. A design bakeoff returns the note and the final design to the caller.
- **Selection rule:** declare it before spawning: `best-of` with grafts (default), `first-pass` (the first candidate meeting every must-have criterion), or `rank-all`.

## Candidates

The brief is the contract: every candidate gets the same one. Claude vs Codex is the headline mode:

| Seat | From a Claude Code thread | From a Codex thread |
| --- | --- | --- |
| Claude | Native sub-agent: Agent tool, `run_in_background: true`, no `model` | `agent-orchestrator` run, `--engine claude` |
| Codex | `agent-orchestrator` run, `--engine codex` | Native sub-agent on the session's model |

- Native seats run on the current thread's model; do not pin one. Orchestrator seats use that engine's default unless the user names an alias (`opus`, `fable`, `sol`, `terra`). Add an OpenCode seat (`grok`, `kimi`) only when the user asks. Cross-harness seats go only through `agent-orchestrator`; never shell out to `claude` or `codex` yourself.
- Same-harness bakeoffs (repeat attempts on one model, or extra design directions) use native sub-agents only.
- Never give a candidate the lead's conversation (no forked or context-inheriting sub-agent); it would see the rubric.
- Orchestrator runs are awaited. Run its `preflight` once, spawn the native seats first, then start each orchestrator run with its own `--name`, `--cwd`, and an `--out-dir` outside the candidate's directory. In Claude Code, launch it as a background Bash command so the thread stays free; its completion notification is the await, as in `agent-conductor`. Parallel runs are safe because each gets its own run directory.

## 1. Frame

1. State the artifact, the grounding paths, and the selection rule. Write the rubric for the judge only.
2. Give each candidate its own location under a neutral label (`a`, `b`, `c`). Code candidates get a git worktree each, which you create and pass as the working directory; a code bakeoff is the explicit worktree request `agent-orchestrator` requires, so tell the user where they are. Otherwise use a scratch directory such as `/tmp/<slug>/<label>/`. Design candidates may read the shared checkout but write only their own file.
3. Write one candidate prompt: the brief, the grounding paths, the output location, and two deliverables: the artifact, and a short rationale naming the alternatives it considered and rejected. No rubric, and no mention of other candidates.

## 2. Fan out and wait

Launch every candidate, then wait for all of them. A candidate that fails or produces nothing is a dropout: re-run it once, then proceed with N-1 and record it. A missing result is a gap, and a gap never counts as a pass. In Claude vs Codex mode, a lone survivor is not a comparison; say so.

## 3. Judge

- Only after every candidate has finished, spawn one read-only judge as a native sub-agent on the thread's model. Give it the rubric, the candidates by neutral label, and their rationales, with anything that names a harness or model stripped. It scores each criterion and recommends a base with reasons.
- Meanwhile, read every candidate end to end and score each criterion yourself, not on overall feel. Agreement with the judge confirms the pick. Disagreement means bias or an ambiguous rubric: reread both rationales before deciding. You and the judge share a model family with one seat, so blind labels and per-criterion scores are the guard against self-preference.

## 4. Pick and graft

- Pick the base a future maintainer can extend most easily without breaking invariants. On a tie, take the cleaner boundary or the smaller API.
- Walk each other candidate once for what is worth porting, usually one or two ideas each. Fold each graft in by hand so the result keeps one mental model; never paste mechanically.
- Convergence on one shape is a strong signal: ship the consensus without grafting. Wild divergence means the brief was under-specified: reframe and re-run rather than averaging.

## 5. Verify and close

- Verify the synthesized artifact like any other output: run its tests and exercise it. A problem no candidate caught means the brief was wrong; one a candidate caught means a missed graft.
- Write the synthesis note beside the artifact or in your reply. Remove candidate worktrees and branches once grafting is done unless the user wants them kept. Commit only if asked.

## Eval mode

Blind-test a skill or prompt variant, for example a change proposed by `session-reflect`, before promoting it.

- **Blinding:** no `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `bakeoff` in any directory, file, branch, or prompt a candidate sees. The prompt reads like a real user request: state the goal, not the meta. Do not ask candidates to list the skills or files they used. Use project-shaped directory names. Candidates never learn that others exist. Orchestrator seats also get `--raw-prompt`, which drops the worker handoff footer.
- **Setup:** one sanitized directory per candidate, holding the variant where the harness discovers it on its own (the project's `.claude/skills/` or `.agents/skills/`) and the project skeleton a real task would have. Native sub-agents inherit the parent's skill catalog, so a skill variant needs a fresh session: run those seats through `agent-orchestrator`, on either engine. Prompt variants can run as native sub-agents. When the skill is used in both harnesses, run a seat in each.
- **Judge:** blind, as in step 3. When comparing a baseline with a variant, one judge scores both sets in a single pass on one scale without knowing which set is which.
- **Grade step-following from transcripts, never self-report.** Use `agent-thread-reader` to see which files each candidate actually opened, including which `SKILL.md` copy; a run that read a globally installed copy instead of the variant is void. Then read every output yourself and compare with the judge.
- **Reply:** the variant under test, the rubric, per-candidate notes, the judge's verdict, your synthesis, and whether to promote the variant.
