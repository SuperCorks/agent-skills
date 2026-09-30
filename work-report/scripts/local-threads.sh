#!/usr/bin/env bash
# Local agent threads touching a project, since a date.
# Usage: local-threads.sh <since YYYY-MM-DD> <match substring, e.g. project slug>
set -euo pipefail
SINCE="${1:?since date required}"
MATCH="$(printf '%s' "${2:?match substring required}" | tr '[:upper:]' '[:lower:]')"

echo "== T3 Code"
ENV_ID="$(cat "$HOME/.t3-fork/userdata/environment-id" 2>/dev/null || true)"
DB="$HOME/.t3-fork/userdata/state.sqlite"
if [ -n "$ENV_ID" ] && [ -f "$DB" ]; then
  sqlite3 -separator ' | ' "$DB" "
    select substr(t.updated_at,1,10), coalesce(t.title,'(untitled)'), t.thread_id
    from projection_threads t
    left join projection_projects pr on pr.project_id = t.project_id
    where t.updated_at >= '$SINCE' and t.deleted_at is null
      and (lower(coalesce(pr.workspace_root,'')) like '%$MATCH%'
           or lower(coalesce(t.worktree_path,'')) like '%$MATCH%'
           or lower(coalesce(t.title,'')) like '%$MATCH%')
    order by 1;" 2>/dev/null |
  while IFS='|' read -r d title tid; do
    printf '%s |%s | t3cork://app/%s/%s\n' "$(echo "$d" | xargs)" "$title" "$ENV_ID" "$(echo "$tid" | xargs)"
  done
fi

echo "== Claude Code"
for base in "$HOME"/.claude*/projects; do
  [ -d "$base" ] || continue
  find "$base" -path "*${MATCH}*" -name '*.jsonl' -newermt "$SINCE" 2>/dev/null
done | grep -v '/subagents/' | while read -r f; do
  printf '%s | %s | %s\n' \
    "$(stat -f '%Sm' -t '%Y-%m-%d' "$f")" \
    "$(basename "$(dirname "$f")" | cut -c1-42)" \
    "$(python3 - "$f" <<'PY'
import json, sys
with open(sys.argv[1], errors="ignore") as fh:
    for line in fh:
        try: entry = json.loads(line)
        except ValueError: continue
        if entry.get("type") != "user": continue
        content = entry.get("message", {}).get("content")
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        if isinstance(content, str) and content.strip() and "<system-reminder>" not in content and not content.startswith("Caveat"):
            print(content.strip().replace("\n", " ")[:110]); break
PY
)"
done | sort

echo "== Codex"
for home in "$HOME"/.codex*/; do
  index="$home/session_index.jsonl"
  [ -f "$index" ] || continue
  python3 - "$index" "$SINCE" "$MATCH" <<'PY'
import json, sys
index, since, match = sys.argv[1], sys.argv[2], sys.argv[3]
seen = set()
for line in open(index, errors="ignore"):
    try: entry = json.loads(line)
    except ValueError: continue
    when = str(entry.get("updated_at") or entry.get("created_at") or "")
    name = entry.get("thread_name") or entry.get("title") or ""
    cwd = str(entry.get("cwd") or entry.get("workspace") or "")
    if when >= since and (match in cwd.lower() or match in name.lower()):
        seen.add((when[:10], name[:95]))
for row in sorted(seen):
    print(" | ".join(row))
PY
done | sort -u
