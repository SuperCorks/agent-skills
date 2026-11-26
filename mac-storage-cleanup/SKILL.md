---
name: mac-storage-cleanup
description: Audit MacBook or macOS disk usage, explain where the space went, rank cleanup opportunities, and execute and verify an authorized local cleanup. Use for low disk space, System Data, stale development worktrees, build caches, simulators, or Docker storage.
---

# Mac Storage Cleanup

Run the disk probes and cleanup on the target Mac. A copy of this skill in a Linux agent profile provides the workflow for a Mac task. It does not make these commands applicable to the Linux host. Start with a read-only snapshot and identify the biggest useful gains. Treat “check,” “break down,” and “what can I clear?” as audit requests. For an authorized cleanup, carry forward the exact approved categories, paths, cutoffs, and exceptions, and refresh the evidence before acting.

1. **Get the disk total.** Run `python3 scripts/storage_probe.py snapshot` from this skill folder. This resolves the startup Data volume to its APFS container and measures actual used and free bytes. Use the Data volume for file scans. Keep the system, preboot, recovery, update, and swap volumes distinct from items in the Data volume.
2. **Find the biggest contributors.** Start with broad folders and their first level, then drill into the largest. Start with known workspaces, `~/Library`, project tool caches, `/Applications`, and local temp data as relevant. Avoid duplicating long recursive scans. The read-only probe can measure APFS exclusive file bytes for selected trees. Use `python3 scripts/storage_probe.py scan --depth 1 -- "$HOME/Library/Developer" "$HOME/Downloads"` for target paths. For output fields and fallbacks, see [Measurement](references/measurement.md).
3. **Rank concrete options.** Name the exact thing occupying space, with a path, measured size, recovery estimate if supported, and what rebuilding or redownloading means. Separate regenerable outputs from local-only assets, persistent data, and files of uncertain provenance. Expand catchalls like “other” or “source and assets” when material: Rust targets, Android intermediates, test builds, emulator images, exports, media, installers, and logs can be larger than the source. Exclude overlaps when adding estimates. Format an actionable shortlist with numbers when the user is choosing what to clear.
4. **Recheck and act within scope.** Resolve paths, reject unexpected symlinks or mount crossings, and recheck activity, ownership and tracked files when relevant. Inspect live processes and open files, and running Docker bind mounts for project paths. A clean Git status or ignored directory can still contain unique data. Prefer each tool's narrower cleanup operation where it preserves registrations or live state. If a candidate changed or remains ambiguous, leave it in place and finish independent approved items.
5. **Verify.** Check exact deleted targets or cleared contents, Git registrations or Docker state where applicable, and the same APFS free-space measurement after cleanup. Distinguish confirmed deletion, estimates, skips, and observed free-space gain. Note material background activity or APFS sharing if it affects the comparison. For larger batches keep a small private local manifest with scope, results, and measurements. Use a durable local path such as `~/.local/state/mac-storage-cleanup/` if the user will need it later. Temporary files can disappear across runs.

Read only the references relevant to the request:

- [Cleanup targets](references/cleanup-targets.md) for native builds, dependencies, Xcode, simulators, browser caches, local models, and Downloads.
- [Git worktrees](references/worktrees.md) for project and worktree activity, preserving primary checkouts, and safe removal.
- [Docker and local databases](references/docker-and-databases.md) for images, build caches, volumes, and Prisma durable streams.
