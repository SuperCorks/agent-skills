#!/usr/bin/env bash

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
WORKSPACE_ROOT=$(dirname "$SCRIPT_DIR")
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
CANONICAL_CLONE_URL='{{WORKSPACE_REPO_URL}}'
FAILURES=0

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/workspace-validate.XXXXXX") || exit 1
cleanup() {
  case "$TMP_ROOT" in
    "${TMPDIR:-/tmp}"/workspace-validate.*) rm -rf "$TMP_ROOT" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

MANIFEST_FOLDERS="$TMP_ROOT/manifest-folders"
README_FOLDERS="$TMP_ROOT/readme-folders"

if "$BOOTSTRAP" --validate; then
  pass "repository manifest is valid"
else
  fail "repository manifest validation failed"
fi

if "$BOOTSTRAP" --list-folders | sort -u > "$MANIFEST_FOLDERS"; then
  pass "manifest folders are readable"
else
  fail "could not list manifest folders"
fi

sed -n '/<!-- repositories:start -->/,/<!-- repositories:end -->/p' \
  "$WORKSPACE_ROOT/README.md" | sed -n 's/^| `\([^`]*\)` |.*/\1/p' | sort -u > "$README_FOLDERS"

if diff -u "$MANIFEST_FOLDERS" "$README_FOLDERS" >/dev/null; then
  pass "README repository table matches repos.yaml"
else
  fail "README repository table does not match repos.yaml"
  diff -u "$MANIFEST_FOLDERS" "$README_FOLDERS" >&2 || true
fi

while IFS= read -r folder; do
  [ -z "$folder" ] && continue
  if grep -Fq "$folder" "$WORKSPACE_ROOT/AGENTS.md"; then
    pass "AGENTS.md includes $folder"
  else
    fail "AGENTS.md is missing $folder"
  fi
done < "$MANIFEST_FOLDERS"

if grep -Fq "$CANONICAL_CLONE_URL" "$WORKSPACE_ROOT/README.md"; then
  pass "README uses the canonical root clone URL"
else
  fail "README canonical root clone URL is missing"
fi

if grep -n 'TODO(setup)' "$WORKSPACE_ROOT/AGENTS.md" "$WORKSPACE_ROOT/README.md" >&2; then
  fail "unresolved TODO(setup) placeholders remain in AGENTS.md or README.md"
else
  pass "no setup placeholders remain"
fi

for script_path in \
  "$WORKSPACE_ROOT/scripts/bootstrap.sh" \
  "$WORKSPACE_ROOT/scripts/validate-workspace.sh" \
  "$WORKSPACE_ROOT/tests/bootstrap.sh"; do
  if bash -n "$script_path"; then
    pass "shell syntax: ${script_path#"$WORKSPACE_ROOT/"}"
  else
    fail "shell syntax failed: ${script_path#"$WORKSPACE_ROOT/"}"
  fi
  if [ -x "$script_path" ]; then
    pass "executable bit: ${script_path#"$WORKSPACE_ROOT/"}"
  else
    fail "not executable: ${script_path#"$WORKSPACE_ROOT/"}"
  fi
done

if git -C "$WORKSPACE_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
   [ "$(git -C "$WORKSPACE_ROOT" rev-parse --show-toplevel)" = "$WORKSPACE_ROOT" ]; then
  if git -C "$WORKSPACE_ROOT" ls-files --stage | awk '$1 == "160000" { found = 1 } END { exit found ? 0 : 1 }'; then
    fail "outer repository contains a gitlink"
  else
    pass "outer repository contains no gitlinks"
  fi

  while IFS= read -r folder; do
    [ -z "$folder" ] && continue
    if [ -n "$(git -C "$WORKSPACE_ROOT" ls-files -- "$folder" "$folder/*")" ]; then
      fail "outer repository tracks content under $folder"
    else
      pass "outer repository does not track $folder"
    fi
    if git -C "$WORKSPACE_ROOT" check-ignore --quiet "$folder"; then
      pass "outer repository ignores $folder"
    else
      fail "outer repository does not ignore $folder"
    fi
  done < "$MANIFEST_FOLDERS"

  if [ -n "$(git -C "$WORKSPACE_ROOT" ls-files -- outputs .worktrees tmp)" ]; then
    fail "outer repository tracks local outputs, tmp, or worktrees"
  else
    pass "outer repository excludes local outputs, tmp, and worktrees"
  fi
else
  printf 'SKIP  Git tracking boundary (root repository is not initialized yet)\n'
fi

if [ "$FAILURES" -gt 0 ]; then
  printf '\nWorkspace validation failed with %s error(s).\n' "$FAILURES" >&2
  exit 1
fi

printf '\nWorkspace validation passed.\n'
