# Measuring macOS storage

- The startup APFS container's capacity minus free bytes is the actual disk total. Several APFS volumes share that free pool, so summing `df` free totals across volumes is incorrect. Resolve the Data device with `diskutil info -plist /System/Volumes/Data` and the container with `diskutil apfs list -plist`, or use the bundled snapshot command. On modern macOS, ordinary files live in the Data volume. Sealed system volumes, Preboot, Update, Recovery, and VM are separate entries. A mounted simulator runtime image is already stored somewhere on a parent disk. Its mount usage must not be added to the backing file size.
- For a quick folder scan, use `du -x -k -d 1 <absolute-path>` and convert its KiB output to the same units as the disk measurement. File counts and apparent file lengths can be misleading. Sparse virtual disks such as `Docker.raw` can have a large logical maximum. Use `stat -f '%b %z' <file>` for allocated 512-byte blocks and logical bytes respectively.
- A folder scan can count APFS cloned blocks more than once. Package stores, duplicate checkouts, and browser code-signing copies are common examples. Multiple hard links also share storage. An allocated folder size helps rank locations. It can exceed the actual disk total or the space returned by deleting one copy.

## The bundled probe

From the skill folder:

```sh
python3 scripts/storage_probe.py snapshot
python3 scripts/storage_probe.py scan --depth 1 -- "$HOME/Library/Developer"
```

Both modes are read-only with respect to the measured paths. The scan compiles a small macOS helper in a temporary directory using the installed Apple toolchain. It reports directory rows as JSON lines. The requested roots are depth zero. Depth controls which directory rows are printed, while each row includes its descendants. Use a narrow root before increasing depth. If Python or the compiler is unavailable, use `df -k`, `diskutil apfs list`, and targeted `du -x` scans without estimating exclusive bytes.

- `allocated_bytes` is allocated bytes reported for regular files, excluding filesystem metadata, symlink targets, and nested mounts. File hard links are counted once within a scanned root. When counted under one of multiple child folders, attribution depends on traversal order. Avoid summing overlapping directory rows or assuming separate roots deduplicate hard links.
- `exclusive_bytes` uses APFS file private-size metadata and is null if that metadata was missing for any counted file. It excludes blocks shared with clones or retained by snapshots. It is a conservative contribution estimate for comparing folders, not a guarantee of whole-tree savings. Another link elsewhere can keep a file allocated, and removing the last of multiple clones can return additional space.
- `newest_timestamp` is the latest creation or modification time seen in the scanned tree. It can show a recent write but cannot demonstrate disuse, and can reflect regenerated caches rather than source edits. For inactivity decisions, check relevant source and Git activity separately from generated folders.
- Check `errors` and tool exit status. Permission-denied paths such as Trash, Photos, or app-protected storage leave an incomplete inventory. Report access gaps; do not dismiss them as empty or assume one inaccessible area accounts for the gap.

Use the container's before/after free bytes for the actual observed result. Record measurements closely around the batch and verify object counts separately. An APFS snapshot, shared blocks, background builds, cache regeneration, or concurrent cleanup can make reported free-space gain differ from the sum of measured targets. For snapshot questions, inspect the intended APFS volume's snapshots and distinguish Time Machine snapshots from macOS update snapshots. Leave system/update snapshots and swap to macOS during ordinary cleanup.
