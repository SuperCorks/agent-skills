# Maintain an existing verification skill

Read this when the user asks to audit, refresh, or check an existing project-local verification skill and its feature map. A map drifts as the app changes; this pass finds and corrects the drift. The unit of rigor is the feature: cover every feature file from source and drive every feature live, without proving every sentence.

## Outcomes

Report exactly one:

- **clean**: every feature had source and live coverage, and nothing needed correcting.
- **changed**: proven corrections to the map, instructions, or harness were applied.
- **blocked**: coverage could not finish, or a proven fix could not be applied safely. Say exactly what blocked it.

## Boundaries

- Edit only inside the verification skill's own directory: its `SKILL.md`, feature files, and the helpers it owns. Never edit product code.
- The boundaries in [SKILL.md](../SKILL.md) still apply: safe targets only, and preserve user-owned processes, sessions, data, and ports.
- Commit or open a pull request only when the user asks. Then use `git-workflow-gates` and `github-pr-formatting`, keep it to one PR of proven corrections, and re-read every changed file first.

## Pass

1. **Locate the target.** Find the project-local skill with launch, doctor, and drive sections and a feature map. If several match, ask which one; if none does, stop and offer the bootstrap workflow instead of inventing a target.
2. **Index hygiene.** Read the feature index and list its sibling files. Fix missing, extra, duplicate, or dead entries, and bring each feature file back to the four-section contract in [SKILL.md](../SKILL.md#seed-a-small-feature-map).
3. **Source wave.** Launch one read-only sub-agent per feature file in a single message, using the harness's native sub-agents on the current model. Each explains how its feature works from source, flags likely drift with `file:line` citations, and returns: feature summary, source entry points, likely drift or none, and one live-verification recipe. Sub-agents never drive the app or edit files.
4. **Reconcile.** Require a summary for every feature file. Merge overlapping recipes into as few app states as practical. Spot-check cited drift without re-proving clean claims. Sweep recent history for user-facing surfaces missing from the map, and require a concrete source path before calling one missing.
5. **Live pass.** Required even when the source looks clean. Only the coordinator drives, following the verification skill's own launch model: one long-lived instance driven serially, or a fresh isolated session per drive for short-lived CLIs. Drive every feature at least once and hold three invariants throughout:
   - Never drive an instance that has not passed doctor since it last surprised you: run doctor before the first drive, on each fresh session, and after any failed drive. When doctor cannot see the failure, such as a wedged UI on a healthy process, reset to a known state or relaunch.
   - Evidence captured so far survives every cleanup; check it at its named location rather than assuming.
   - Nothing a drive started outlives it. Clean failed-attempt residue whether the session is stuck, exited, or shared; for a shared instance, clean the residue, not the instance.

   A doctor failure caused by skill drift is drift: fix it and retry once, restarting only what the fix invalidated, before reporting `blocked`. Record a feature as unreachable only with the attempted route and the concrete unmet prerequisite (auth, entitlement, OS, or external state); a prerequisite the map omits is drift. Re-drive every harness fix live, and tear down only after the last drive, including those re-proofs.
6. **Triage.** Classify each discrepancy:
   - **Doc drift**: a wrong or missing user-facing description. Fix the map.
   - **Harness gap**: working behavior the harness cannot drive. Fix the harness under the same helper rules as generation: linked from `SKILL.md`, invocation documented, and tested.
   - **Product gap**: app behavior that is actually broken. Report it to the user; never paper over it in the map.
7. **Report.** State the outcome, features covered, unreachable features with their prerequisites, drift fixed, product gaps, evidence location, and cleanup result. Keep run notes in a scratch location outside the repository and do not commit them.

Adapted from cursor/plugins pstack (MIT, © 2026 Lauren Tan)
