#!/usr/bin/env bash
# Local agent threads touching a project, since a date.
# Usage: local-threads.sh <since YYYY-MM-DD> <match> [<match>...]
# A thread is included when any match substring appears in its workspace, worktree, or title.
set -euo pipefail
SINCE="${1:?since date required}"
shift
[ "$#" -gt 0 ] || { echo "at least one match substring required" >&2; exit 1; }
MATCHES=()
for m in "$@"; do MATCHES+=("$(printf '%s' "$m" | tr '[:upper:]' '[:lower:]')"); done

# SQL "(col like '%m%' or ...)" over every match and every given column expression.
sql_match() {
  local clause="" m col
  for m in "${MATCHES[@]}"; do
    m="$(printf '%s' "$m" | sed "s/'/''/g")"
    for col in "$@"; do
      clause="${clause:+$clause or }lower(coalesce($col,'')) like '%$m%'"
    done
  done
  printf '(%s)' "$clause"
}

echo "== T3 Code"
T3="$HOME/.t3-fork/userdata"
ENV_ID="$(cat "$T3/environment-id" 2>/dev/null || true)"
SEP=$'\x1f'
if [ -n "$ENV_ID" ] && [ -f "$T3/statev2.sqlite" ]; then
  # Current store. Native sub-agent children are skipped: their work belongs to the parent thread.
  sqlite3 -readonly -separator "$SEP" "$T3/statev2.sqlite" "
    select substr(t.updated_at,1,10), t.title, t.thread_id
    from orchestration_v2_projection_threads t
    left join projection_projects pr on pr.project_id = t.project_id
    where t.updated_at >= '$SINCE' and t.deleted_at is null
      and coalesce(json_extract(t.payload_json,'\$.lineage.relationshipToParent'),'') != 'subagent'
      and $(sql_match pr.workspace_root "json_extract(t.payload_json,'\$.worktreePath')" t.title)
    order by 1;"
elif [ -n "$ENV_ID" ] && [ -f "$T3/state.sqlite" ]; then
  echo "(legacy state.sqlite; statev2.sqlite not found)"
  sqlite3 -readonly -separator "$SEP" "$T3/state.sqlite" "
    select substr(t.updated_at,1,10), coalesce(t.title,'(untitled)'), t.thread_id
    from projection_threads t
    left join projection_projects pr on pr.project_id = t.project_id
    where t.updated_at >= '$SINCE' and t.deleted_at is null
      and $(sql_match pr.workspace_root t.worktree_path t.title)
    order by 1;"
fi | while IFS="$SEP" read -r d title tid; do
  printf '%s | %s | t3cork://app/%s/%s\n' "$d" "$title" "$ENV_ID" "$tid"
done

echo "== Claude Code"
for base in "$HOME"/.claude*/projects; do
  [ -d "$base" ] || continue
  for m in "${MATCHES[@]}"; do
    find "$base" -ipath "*${m}*" -name '*.jsonl' -newermt "$SINCE" 2>/dev/null
  done
done | grep -v '/subagents/' | sort -u | while read -r f; do
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
  python3 - "$index" "$SINCE" "${MATCHES[@]}" <<'PY'
import json, sys
index, since, matches = sys.argv[1], sys.argv[2], sys.argv[3:]
seen = set()
for line in open(index, errors="ignore"):
    try: entry = json.loads(line)
    except ValueError: continue
    when = str(entry.get("updated_at") or entry.get("created_at") or "")
    name = entry.get("thread_name") or entry.get("title") or ""
    cwd = str(entry.get("cwd") or entry.get("workspace") or "")
    if when >= since and any(m in cwd.lower() or m in name.lower() for m in matches):
        seen.add((when[:10], name[:95]))
for row in sorted(seen):
    print(" | ".join(row))
PY
done | sort -u
