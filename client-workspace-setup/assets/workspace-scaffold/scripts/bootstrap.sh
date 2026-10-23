#!/usr/bin/env bash

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
DEFAULT_ROOT=$(dirname "$SCRIPT_DIR")
WORKSPACE_ROOT=$DEFAULT_ROOT
MANIFEST_PATH="$DEFAULT_ROOT/repos.yaml"
MODE=clone
ALLOW_LOCAL_REMOTES=false

if [ -t 1 ]; then
  BLUE='\033[0;34m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  RESET='\033[0m'
else
  BLUE=''
  GREEN=''
  YELLOW=''
  RED=''
  RESET=''
fi

info() { printf '%b%s%b\n' "$BLUE" "$*" "$RESET"; }
success() { printf '%b%s%b\n' "$GREEN" "$*" "$RESET"; }
warn() { printf '%b%s%b\n' "$YELLOW" "$*" "$RESET" >&2; }
error() { printf '%b%s%b\n' "$RED" "$*" "$RESET" >&2; }

show_help() {
  cat <<'EOF'
{{CLIENT_NAME}} workspace bootstrap

Usage:
  ./scripts/bootstrap.sh [--pull | --status | --validate]

Modes:
  (default)   Clone repositories that are missing. Existing repos are unchanged.
  --pull      Clone missing repos, fetch existing repos, and fast-forward only
              clean repos already on their declared default branch.
  --status    Report each repository's branch, dirty state, remote match, and
              ahead/behind state without fetching or changing anything.
  --validate  Validate the repository manifest without cloning or fetching.

Options:
  --help      Show this help.

Exit codes:
  0  Completed successfully.
  1  A validation, clone, fetch, or repository error occurred.
  2  Pull completed partially because at least one repo was safely skipped.
EOF
}

require_value() {
  option_name=$1
  option_value=${2-}
  if [ -z "$option_value" ]; then
    error "$option_name requires a value."
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pull)
      MODE=pull
      ;;
    --status)
      MODE=status
      ;;
    --validate)
      MODE=validate
      ;;
    --list-folders)
      MODE=list-folders
      ;;
    --manifest)
      require_value "$1" "${2-}"
      MANIFEST_PATH=$2
      shift
      ;;
    --root)
      require_value "$1" "${2-}"
      WORKSPACE_ROOT=$2
      shift
      ;;
    --allow-local-remotes)
      ALLOW_LOCAL_REMOTES=true
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      show_help >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v git >/dev/null 2>&1; then
  error "Git is required but was not found in PATH."
  exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
  error "Workspace root does not exist: $WORKSPACE_ROOT"
  exit 1
fi

if [ ! -f "$MANIFEST_PATH" ]; then
  error "Repository manifest not found: $MANIFEST_PATH"
  exit 1
fi

ENTRIES_FILE=$(mktemp "${TMPDIR:-/tmp}/workspace-repos.XXXXXX") || exit 1
trap 'rm -f "$ENTRIES_FILE"' EXIT HUP INT TERM

parse_manifest() {
  awk '
    function clean(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) {
        value = substr(value, 2, length(value) - 2)
      }
      return value
    }
    function value_after_colon(line) {
      sub(/^[^:]*:[[:space:]]*/, "", line)
      return clean(line)
    }
    function emit() {
      if (active) {
        print name "|" folder "|" url "|" branch "|" description
      }
    }
    /^[[:space:]]*-[[:space:]]+name:[[:space:]]*/ {
      emit()
      active = 1
      name = value_after_colon($0)
      folder = ""
      url = ""
      branch = ""
      description = ""
      next
    }
    active && /^[[:space:]]+folder:[[:space:]]*/ { folder = value_after_colon($0); next }
    active && /^[[:space:]]+url:[[:space:]]*/ { url = value_after_colon($0); next }
    active && /^[[:space:]]+branch:[[:space:]]*/ { branch = value_after_colon($0); next }
    active && /^[[:space:]]+description:[[:space:]]*/ { description = value_after_colon($0); next }
    END { emit() }
  ' "$MANIFEST_PATH"
}

if ! parse_manifest > "$ENTRIES_FILE"; then
  error "Could not parse repository manifest: $MANIFEST_PATH"
  exit 1
fi

normalize_remote() {
  remote_value=$1
  remote_value=${remote_value%/}
  remote_value=${remote_value%.git}
  case "$remote_value" in
    https://github.com/*)
      remote_value=${remote_value#https://github.com/}
      printf 'github.com/%s\n' "$remote_value" | tr '[:upper:]' '[:lower:]'
      ;;
    http://github.com/*)
      remote_value=${remote_value#http://github.com/}
      printf 'github.com/%s\n' "$remote_value" | tr '[:upper:]' '[:lower:]'
      ;;
    git@github.com:*)
      remote_value=${remote_value#git@github.com:}
      printf 'github.com/%s\n' "$remote_value" | tr '[:upper:]' '[:lower:]'
      ;;
    ssh://git@github.com/*)
      remote_value=${remote_value#ssh://git@github.com/}
      printf 'github.com/%s\n' "$remote_value" | tr '[:upper:]' '[:lower:]'
      ;;
    *)
      printf '%s\n' "$remote_value"
      ;;
  esac
}

manifest_errors=0
entry_count=0
seen_names='|'
seen_folders='|'

while IFS='|' read -r repo_name folder url branch description; do
  [ -z "$repo_name$folder$url$branch$description" ] && continue
  entry_count=$((entry_count + 1))

  if [ -z "$repo_name" ] || [ -z "$folder" ] || [ -z "$url" ] || [ -z "$branch" ] || [ -z "$description" ]; then
    error "Manifest entry $entry_count is missing name, folder, url, branch, or description."
    manifest_errors=$((manifest_errors + 1))
    continue
  fi

  case "$repo_name" in
    *[!A-Za-z0-9._-]*) error "Invalid repository name: $repo_name"; manifest_errors=$((manifest_errors + 1)) ;;
  esac
  case "$folder" in
    *[!A-Za-z0-9._-]*|.|..) error "Invalid root-level repository folder: $folder"; manifest_errors=$((manifest_errors + 1)) ;;
  esac
  case "$seen_names" in
    *"|$repo_name|"*) error "Duplicate repository name: $repo_name"; manifest_errors=$((manifest_errors + 1)) ;;
    *) seen_names="$seen_names$repo_name|" ;;
  esac
  case "$seen_folders" in
    *"|$folder|"*) error "Duplicate repository folder: $folder"; manifest_errors=$((manifest_errors + 1)) ;;
    *) seen_folders="$seen_folders$folder|" ;;
  esac

  case "$url" in
    https://github.com/*|git@github.com:*|ssh://git@github.com/*) ;;
    file://*)
      if [ "$ALLOW_LOCAL_REMOTES" != true ]; then
        error "Local remote URLs are allowed only for fixture testing: $repo_name"
        manifest_errors=$((manifest_errors + 1))
      fi
      ;;
    *) error "Unsupported repository URL for $repo_name. Use GitHub HTTPS or SSH."; manifest_errors=$((manifest_errors + 1)) ;;
  esac

  if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
    error "Invalid branch name for $repo_name: $branch"
    manifest_errors=$((manifest_errors + 1))
  fi
done < "$ENTRIES_FILE"

if [ "$entry_count" -eq 0 ]; then
  error "Manifest contains no repositories."
  manifest_errors=$((manifest_errors + 1))
fi

if [ "$manifest_errors" -gt 0 ]; then
  error "Manifest validation failed with $manifest_errors error(s)."
  exit 1
fi

if [ "$MODE" = validate ]; then
  success "Manifest valid: $entry_count repositories."
  exit 0
fi

if [ "$MODE" = list-folders ]; then
  while IFS='|' read -r repo_name folder url branch description; do
    [ -n "$folder" ] && printf '%s\n' "$folder"
  done < "$ENTRIES_FILE"
  exit 0
fi

cloned=0
updated=0
unchanged=0
missing=0
skipped=0
failed=0

repo_origin_matches() {
  repo_path=$1
  expected_url=$2
  actual_url=$(git -C "$repo_path" config --get remote.origin.url 2>/dev/null || true)
  [ -n "$actual_url" ] && [ "$(normalize_remote "$actual_url")" = "$(normalize_remote "$expected_url")" ]
}

repo_status_line() {
  repo_path=$1
  folder=$2
  branch=$3
  current_branch=$(git -C "$repo_path" branch --show-current 2>/dev/null || true)
  [ -n "$current_branch" ] || current_branch='detached'
  if [ -n "$(git -C "$repo_path" status --porcelain=v1 2>/dev/null)" ]; then
    dirty_state=dirty
  else
    dirty_state=clean
  fi
  relation='unavailable'
  if git -C "$repo_path" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    counts=$(git -C "$repo_path" rev-list --left-right --count "HEAD...refs/remotes/origin/$branch" 2>/dev/null || true)
    if [ -n "$counts" ]; then
      set -- $counts
      relation="ahead=$1 behind=$2"
    fi
  fi
  printf '%-33s branch=%-16s %-5s %s\n' "$folder" "$current_branch" "$dirty_state" "$relation"
}

while IFS='|' read -r repo_name folder url branch description; do
  [ -z "$folder" ] && continue
  repo_path="$WORKSPACE_ROOT/$folder"

  if [ ! -e "$repo_path" ]; then
    if [ "$MODE" = status ]; then
      printf '%-33s missing (expected branch=%s)\n' "$folder" "$branch"
      missing=$((missing + 1))
      continue
    fi

    info "Cloning $folder ($branch)..."
    if git clone --branch "$branch" "$url" "$repo_path"; then
      cloned=$((cloned + 1))
      success "Cloned $folder."
    else
      error "Failed to clone $folder. Authenticate to GitHub and rerun; successful clones will be reused."
      failed=$((failed + 1))
    fi
    continue
  fi

  if ! git -C "$repo_path" rev-parse --git-dir >/dev/null 2>&1; then
    error "$folder exists but is not a Git repository."
    failed=$((failed + 1))
    continue
  fi

  if ! repo_origin_matches "$repo_path" "$url"; then
    error "$folder has an origin that does not match repos.yaml; it was not changed."
    failed=$((failed + 1))
    continue
  fi

  case "$MODE" in
    clone)
      unchanged=$((unchanged + 1))
      success "$folder already exists."
      ;;
    status)
      repo_status_line "$repo_path" "$folder" "$branch"
      unchanged=$((unchanged + 1))
      ;;
    pull)
      info "Fetching $folder..."
      if ! git -C "$repo_path" fetch --prune origin; then
        error "$folder: fetch failed."
        failed=$((failed + 1))
        continue
      fi

      if [ -n "$(git -C "$repo_path" status --porcelain=v1)" ]; then
        warn "$folder: skipped because the worktree is dirty."
        skipped=$((skipped + 1))
        continue
      fi

      current_branch=$(git -C "$repo_path" branch --show-current 2>/dev/null || true)
      if [ "$current_branch" != "$branch" ]; then
        [ -n "$current_branch" ] || current_branch='detached HEAD'
        warn "$folder: skipped because it is on $current_branch, not $branch."
        skipped=$((skipped + 1))
        continue
      fi

      if ! git -C "$repo_path" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        error "$folder: origin/$branch was not found after fetch."
        failed=$((failed + 1))
        continue
      fi

      counts=$(git -C "$repo_path" rev-list --left-right --count "HEAD...refs/remotes/origin/$branch")
      set -- $counts
      ahead=$1
      behind=$2

      if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
        warn "$folder: skipped because local and origin/$branch have diverged."
        skipped=$((skipped + 1))
      elif [ "$behind" -gt 0 ]; then
        if git -C "$repo_path" merge --ff-only --quiet "refs/remotes/origin/$branch"; then
          success "$folder: fast-forwarded by $behind commit(s)."
          updated=$((updated + 1))
        else
          error "$folder: fast-forward failed; no reset or merge recovery was attempted."
          failed=$((failed + 1))
        fi
      else
        if [ "$ahead" -gt 0 ]; then
          success "$folder: clean and $ahead commit(s) ahead of origin/$branch; no pull needed."
        else
          success "$folder: up to date."
        fi
        unchanged=$((unchanged + 1))
      fi
      ;;
  esac
done < "$ENTRIES_FILE"

printf '\nSummary: cloned=%s updated=%s unchanged=%s missing=%s skipped=%s failed=%s\n' \
  "$cloned" "$updated" "$unchanged" "$missing" "$skipped" "$failed"

if [ "$failed" -gt 0 ]; then
  exit 1
fi
if [ "$MODE" = pull ] && [ "$skipped" -gt 0 ]; then
  exit 2
fi
exit 0
