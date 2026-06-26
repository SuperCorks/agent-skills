---
name: browser-profile-sync
description: Merge Chromium browser bookmarks and mirror local cookie databases between Google Chrome, Brave, and Comet on macOS. Use when the user asks to migrate, compare, merge, synchronize, or back up bookmarks or cookies across these browsers, especially when they want Chrome and Brave to share a merged bookmark set or want an on-demand local cookie sync workflow.
---

# Browser Profile Sync

## Overview

Use `scripts/browser_profile_sync.py` for deterministic local operations. It knows the standard macOS profile paths for:

- Chrome: `~/Library/Application Support/Google/Chrome/Default`
- Brave: `~/Library/Application Support/BraveSoftware/Brave-Browser/Default`
- Comet: `~/Library/Application Support/Comet/Default`

The script defaults to dry-run. Use `--apply` only after reviewing the summary. It writes backups under `~/Library/Application Support/browser-profile-sync-backups/<timestamp>` unless `--backup-dir` is supplied. For signed-in Chrome, it reads and writes `AccountBookmarks` as well as `Bookmarks`; after Chrome launches, it may split bookmarks between those stores, so verify Chrome by combining both files rather than inspecting either file alone.

## Bookmark Merge

Use this when merging divergent Chromium bookmark files. Default behavior uses Chrome account bookmarks as the base when present, includes Chrome local bookmarks, Brave, and Comet as sources, de-duplicates by exact URL, regenerates Chromium's bookmark checksum, removes copied sync metadata, and targets Chrome plus Brave.

Dry-run:

```bash
python3 ~/.codex/skills/browser-profile-sync/scripts/browser_profile_sync.py bookmarks
```

Apply:

```bash
python3 ~/.codex/skills/browser-profile-sync/scripts/browser_profile_sync.py bookmarks --apply
```

Close target browsers before applying. If a browser is running, the script refuses to write unless `--allow-running` is passed.

## Cookie Mirror

Use this only when the user explicitly asks to sync cookies. Cookie mirroring replaces each target browser's `Cookies` SQLite database with the source browser's database after backing up the target. It never prints cookie values.

Dry-run:

```bash
python3 ~/.codex/skills/browser-profile-sync/scripts/browser_profile_sync.py cookies --source chrome --targets brave
```

Apply:

```bash
python3 ~/.codex/skills/browser-profile-sync/scripts/browser_profile_sync.py cookies --source chrome --targets brave --apply
```

Close the source and target browsers before applying. Chromium cookies are encrypted locally; copied cookies may be rejected if the browser encryption keys differ. Prefer mirroring from the browser the user actively uses, and explain that this is not a semantic cookie merge.
