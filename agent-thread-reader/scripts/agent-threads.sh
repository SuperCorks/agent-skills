#!/usr/bin/env bash
set -euo pipefail

home_dir="${HOME:-$PWD}"

usage() {
  cat <<'EOF'
Usage:
  agent-threads.sh inventory
  agent-threads.sh subjects [--source all|codex|codex-cli|copilot-cli|copilot-chat|claude-code] [--limit N]
  agent-threads.sh show --path FILE
  agent-threads.sh show --db STATE_VSCDB [--key KEY]

Read-only helper for local coding-agent thread/session stores.
EOF
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

json_record() {
  jq -nc "$@"
}

shorten() {
  tr '\r\n\t' '   ' | sed -E 's/  +/ /g' | cut -c1-120
}

codex_subject_from_path() {
  local file="$1"
  jq -r '
    def textify:
      if type=="string" then .
      elif type=="array" then
        map(
          if type=="object" then
            (.text // (if .type=="input_image" then "[image]" else empty end) // .content // "")
          else tostring end
        ) | join(" ")
      elif type=="object" then (.text // .content // .message // tostring)
      else tostring end;
    [
      select(.type=="response_item" and .payload.role=="user")
      | .payload.content
      | textify
    ]
    | map(select((startswith("# AGENTS.md instructions")|not) and (startswith("<environment_context>")|not)))
    | .[0] // empty
  ' "$file" 2>/dev/null | shorten
}

copilot_cli_subject_from_path() {
  local file="$1"
  jq -r '
    def textify:
      if type=="string" then .
      elif type=="array" then map(if type=="object" then (.text // .content // tostring) else tostring end) | join(" ")
      elif type=="object" then (.text // .content // .message // tostring)
      else tostring end;
    [select(.type=="user.message") | .data.content | textify] | .[0] // empty
  ' "$file" 2>/dev/null | shorten
}

claude_subject_from_path() {
  local file="$1"
  jq -r '
    def textify:
      if type=="string" then .
      elif type=="array" then map(if type=="object" then (.text // .content // tostring) else tostring end) | join(" ")
      elif type=="object" then (.text // .content // .message // tostring)
      else tostring end;
    ([select(.aiTitle) | .aiTitle] | .[0]) //
    ([select(.type=="user") | .message.content? | textify] | .[0]) //
    empty
  ' "$file" 2>/dev/null | shorten
}

inventory() {
  need jq
  need sqlite3

  local codex_home="$home_dir/.codex"
  if [[ -f "$codex_home/session_index.jsonl" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      json_record --argjson row "$line" --arg path "$codex_home/session_index.jsonl" \
        '{source:"codex", store:"session_index", session_id:$row.id, title:$row.thread_name, updated_at:$row.updated_at, path:$path}'
    done < "$codex_home/session_index.jsonl"
  fi

  local dir
  for dir in "$codex_home/sessions" "$codex_home/archived_sessions"; do
    [[ -d "$dir" ]] || continue
    find "$dir" -type f -name '*.jsonl' -print0 2>/dev/null |
      while IFS= read -r -d '' file_path; do
        json_record --arg path "$file_path" --arg store "$(basename "$dir")" \
          --slurpfile rows <(jq -c 'select(.type=="session_meta") | .payload' "$file_path" 2>/dev/null | head -1) '
            ($rows[0] // {}) as $meta |
            {source:"codex", store:$store, session_id:$meta.id, created_at:$meta.timestamp, cwd:$meta.cwd, originator:$meta.originator, path:$path}
          '
      done
  done

  local claude_projects="$home_dir/.claude/projects"
  if [[ -d "$claude_projects" ]]; then
    find "$claude_projects" -type f -name '*.jsonl' -print0 2>/dev/null |
      while IFS= read -r -d '' file_path; do
        json_record --arg path "$file_path" '
          [inputs] as $rows |
          ($rows | map(select(.sessionId)) | .[0] // {}) as $first |
          ($rows | map(select(.aiTitle)) | .[0].aiTitle // null) as $title |
          ($rows | map(select(.timestamp)) | last.timestamp // null) as $updated |
          {source:"claude-code", store:"project_jsonl", session_id:$first.sessionId, title:$title, updated_at:$updated, cwd:$first.cwd, path:$path}
        ' "$file_path"
      done
  fi

  local claude_app_sessions="$home_dir/Library/Application Support/Claude/claude-code-sessions"
  if [[ -d "$claude_app_sessions" ]]; then
    find "$claude_app_sessions" -type f -name '*.json' -print0 2>/dev/null |
      while IFS= read -r -d '' file_path; do
        jq -c --arg path "$file_path" \
          '{source:"claude-code", store:"desktop_metadata", session_id:.sessionId, cli_session_id:.cliSessionId, title:.title, created_at:.createdAt, updated_at:.lastActivityAt, cwd:.cwd, is_archived:.isArchived, path:$path}' \
          "$file_path" 2>/dev/null || true
      done
  fi

  local copilot_sessions="$home_dir/.copilot/session-state"
  if [[ -d "$copilot_sessions" ]]; then
    find "$copilot_sessions" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null |
      while IFS= read -r -d '' session_dir; do
        local events="$session_dir/events.jsonl"
        local workspace="$session_dir/workspace.yaml"
        local session_id
        session_id="$(basename "$session_dir")"
        if [[ -f "$events" ]]; then
          json_record --arg path "$events" --arg session_id "$session_id" --arg workspace_file "$workspace" '
            [inputs] as $rows |
            ($rows | map(select(.type=="session.start")) | .[0].data // {}) as $start |
            ($rows | map(select(.timestamp)) | last.timestamp // null) as $updated |
            {source:"copilot-cli", store:"session_state", session_id:$session_id, created_at:$start.startTime, updated_at:$updated, producer:$start.producer, event_count:($rows|length), workspace_file:$workspace_file, path:$path}
          ' "$events"
        else
          json_record --arg path "$session_dir" --arg session_id "$session_id" \
            '{source:"copilot-cli", store:"session_state", session_id:$session_id, path:$path}'
        fi
      done
  fi

  local app_root
  for app_root in \
    "$home_dir/Library/Application Support/Code/User/workspaceStorage" \
    "$home_dir/Library/Application Support/Code - Insiders/User/workspaceStorage" \
    "$home_dir/Library/Application Support/Agents - Insiders/User/workspaceStorage"; do
    [[ -d "$app_root" ]] || continue
    local app_name
    app_name="$(basename "$(dirname "$(dirname "$app_root")")")"
    find "$app_root" -maxdepth 2 -name state.vscdb -print0 2>/dev/null |
      while IFS= read -r -d '' db; do
        local workspace_file workspace index_json has_interactive
        workspace_file="$(dirname "$db")/workspace.json"
        workspace=""
        [[ -f "$workspace_file" ]] && workspace="$(jq -r '.folder // .workspace // .configuration // empty' "$workspace_file" 2>/dev/null || true)"

        index_json="$(sqlite3 "$db" "select value from ItemTable where key='chat.ChatSessionStore.index'" 2>/dev/null || true)"
        if [[ -n "$index_json" ]]; then
          json_record --argjson index "$index_json" --arg db "$db" --arg workspace "$workspace" --arg app "$app_name" '
            ($index.entries // {}) | to_entries[] |
            {source:"copilot-chat", store:"vscode_chat_index", app:$app, session_id:.key, title:.value.title, updated_at_ms:.value.lastMessageDate, initial_location:.value.initialLocation, is_empty:.value.isEmpty, workspace:$workspace, db:$db}
          '
        fi

        has_interactive="$(sqlite3 "$db" "select length(value) from ItemTable where key='memento/interactive-session'" 2>/dev/null || true)"
        if [[ -n "$has_interactive" ]]; then
          json_record --arg db "$db" --arg workspace "$workspace" --arg app "$app_name" --arg bytes "$has_interactive" \
            '{source:"copilot-chat", store:"vscode_interactive_session", app:$app, workspace:$workspace, db:$db, key:"memento/interactive-session", bytes:($bytes|tonumber)}'
        fi
      done
  done
}

subjects() {
  local source="all"
  local limit="5"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --source) source="${2:-}"; shift 2 ;;
      --limit) limit="${2:-}"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "unknown subjects option: $1" >&2; usage; exit 1 ;;
    esac
  done

  local tmp
  tmp="$(mktemp)"
  trap '[[ -n "${tmp:-}" ]] && rm -f "$tmp"' RETURN
  inventory > "$tmp"

  if [[ "$source" == "all" || "$source" == "codex" ]]; then
    echo "## Codex"
    jq -s -r --argjson limit "$limit" '
      . as $rows |
      ($rows | map(select(.source=="codex" and .store=="session_index")) | map({key:.session_id,value:.title}) | from_entries) as $titles |
      $rows
      | map(select(.source=="codex" and (.store=="sessions" or .store=="archived_sessions") and .originator=="Codex Desktop"))
      | sort_by(.created_at // "") | reverse | .[:$limit][]
      | {created_at, title:($titles[.session_id] // ""), path, session_id}
      | @json
    ' "$tmp" |
      while IFS= read -r row; do
        local created title file_path session_id
        created="$(jq -r '.created_at // ""' <<<"$row")"
        title="$(jq -r '.title // ""' <<<"$row")"
        file_path="$(jq -r '.path // ""' <<<"$row")"
        session_id="$(jq -r '.session_id // ""' <<<"$row")"
        local subject="$title"
        [[ -n "$subject" && "$subject" != "null" ]] || subject="$(codex_subject_from_path "$file_path")"
        [[ -n "$subject" ]] || subject="$session_id"
        printf -- "- %s (%s)\n" "$subject" "$created"
      done
    echo
  fi

  if [[ "$source" == "all" || "$source" == "codex-cli" ]]; then
    echo "## Codex CLI"
    jq -s -r --argjson limit "$limit" '
      map(select(.source=="codex" and (.store=="sessions" or .store=="archived_sessions") and .originator!="Codex Desktop"))
      | sort_by(.created_at // "") | reverse | .[:$limit][]
      | [.created_at, .originator, .path, .cwd] | @tsv
    ' "$tmp" |
      while IFS=$'\t' read -r created origin file_path cwd; do
        local subject
        subject="$(codex_subject_from_path "$file_path")"
        [[ -n "$subject" ]] || subject="$(basename "$file_path")"
        printf -- "- %s [%s] (%s, %s)\n" "$subject" "$origin" "$created" "$cwd"
      done
    echo
  fi

  if [[ "$source" == "all" || "$source" == "copilot-cli" ]]; then
    echo "## Copilot CLI"
    jq -s -r --argjson limit "$limit" '
      map(select(.source=="copilot-cli" and .store=="session_state"))
      | sort_by(.updated_at // .created_at // "") | reverse | .[:$limit][]
      | [.updated_at, .path, .session_id] | @tsv
    ' "$tmp" |
      while IFS=$'\t' read -r updated file_path session_id; do
        local subject
        if [[ -f "$file_path" ]]; then
          subject="$(copilot_cli_subject_from_path "$file_path")"
        else
          subject="$session_id"
        fi
        [[ -n "$subject" ]] || subject="$session_id"
        printf -- "- %s (%s)\n" "$subject" "$updated"
      done
    echo
  fi

  if [[ "$source" == "all" || "$source" == "copilot-chat" ]]; then
    echo "## Copilot Chat"
    jq -s -r --argjson limit "$limit" '
      map(select(.source=="copilot-chat" and .store=="vscode_chat_index" and (.is_empty|not)))
      | sort_by(.updated_at_ms // 0) | reverse | .[:$limit][]
      | "- " + (.title // .session_id) + " (" + (((.updated_at_ms // 0) / 1000) | strftime("%Y-%m-%d %H:%M")) + ", " + (.app // "") + ")"
    ' "$tmp"
    echo
  fi

  if [[ "$source" == "all" || "$source" == "claude-code" ]]; then
    echo "## Claude Code"
    jq -s -r --argjson limit "$limit" '
      map(select(.source=="claude-code" and .store=="project_jsonl"))
      | sort_by(.updated_at // "") | reverse | .[:$limit][]
      | {updated_at, title, path, session_id}
      | @json
    ' "$tmp" |
      while IFS= read -r row; do
        local updated title file_path session_id
        updated="$(jq -r '.updated_at // ""' <<<"$row")"
        title="$(jq -r '.title // ""' <<<"$row")"
        file_path="$(jq -r '.path // ""' <<<"$row")"
        session_id="$(jq -r '.session_id // ""' <<<"$row")"
        local subject="$title"
        [[ -n "$subject" && "$subject" != "null" ]] || subject="$(claude_subject_from_path "$file_path")"
        [[ -n "$subject" ]] || subject="$session_id"
        printf -- "- %s (%s)\n" "$subject" "$updated"
      done
    echo
  fi
}

show_path() {
  local file_path="$1"
  [[ -f "$file_path" ]] || {
    echo "path not found: $file_path" >&2
    exit 1
  }

  case "$file_path" in
    *.jsonl)
      jq -r '
        def textify:
          if type=="string" then .
          elif type=="array" then
            map(if type=="object" then (.text // .content // (if .type=="input_image" then "[image]" else empty end) // "") else tostring end) | join(" ")
          elif type=="object" then (.text // .content // .message // tostring)
          else tostring end;
        if .type=="response_item" and (.payload.role=="user" or .payload.role=="assistant") then
          "\(.payload.role): \(.payload.content | textify)"
        elif .type=="user" or .type=="assistant" then
          "\(.type): \(.message.content? | textify)"
        elif .type=="user.message" then
          "user: \(.data.content | textify)"
        elif .type=="assistant.message" then
          "assistant: \(.data.content | textify)"
        else empty end
      ' "$file_path"
      ;;
    *.json)
      jq . "$file_path"
      ;;
    *)
      sed -n '1,200p' "$file_path"
      ;;
  esac
}

show_db_key() {
  local db="$1"
  local key="$2"
  [[ -f "$db" ]] || {
    echo "db not found: $db" >&2
    exit 1
  }
  sqlite3 "$db" "select value from ItemTable where key='$key';" |
    jq -r '
      if has("history") then
        .history
        | to_entries[]
        | .key as $agent
        | .value[]
        | "\($agent): \(.text // .title // .message // tostring)"
      else . end
    ' 2>/dev/null || sqlite3 "$db" "select value from ItemTable where key='$key';"
}

show_cmd() {
  local file_path=""
  local db=""
  local key="memento/interactive-session"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --path) file_path="${2:-}"; shift 2 ;;
      --db) db="${2:-}"; shift 2 ;;
      --key) key="${2:-}"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "unknown show option: $1" >&2; usage; exit 1 ;;
    esac
  done

  if [[ -n "$file_path" ]]; then
    show_path "$file_path"
  elif [[ -n "$db" ]]; then
    show_db_key "$db" "$key"
  else
    echo "show requires --path or --db" >&2
    usage
    exit 1
  fi
}

main() {
  local command="${1:-subjects}"
  [[ $# -gt 0 ]] && shift
  case "$command" in
    inventory) inventory "$@" ;;
    subjects) subjects "$@" ;;
    show) show_cmd "$@" ;;
    -h|--help|help) usage ;;
    *) echo "unknown command: $command" >&2; usage; exit 1 ;;
  esac
}

main "$@"
