#!/usr/bin/env bash

set -u

TEST_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
WORKSPACE_ROOT=$(dirname "$TEST_DIR")
BOOTSTRAP="$WORKSPACE_ROOT/scripts/bootstrap.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/workspace-bootstrap-test.XXXXXX") || exit 1
PASS_COUNT=0

cleanup() {
  case "$TEST_ROOT" in
    "${TMPDIR:-/tmp}"/workspace-bootstrap-test.*)
      chmod -R u+w "$TEST_ROOT" 2>/dev/null || true
      rm -rf "$TEST_ROOT"
      ;;
  esac
}
trap cleanup EXIT HUP INT TERM

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }

assert_equal() {
  expected=$1
  actual=$2
  label=$3
  if [ "$expected" = "$actual" ]; then pass "$label"; else fail "$label (expected=$expected actual=$actual)"; fi
}

assert_file() {
  file_path=$1
  label=$2
  if [ -f "$file_path" ]; then pass "$label"; else fail "$label (missing $file_path)"; fi
}

run_expect() {
  expected_code=$1
  label=$2
  shift 2
  "$@" > "$TEST_ROOT/last-command.log" 2>&1
  actual_code=$?
  if [ "$actual_code" -eq "$expected_code" ]; then
    pass "$label"
  else
    sed -n '1,200p' "$TEST_ROOT/last-command.log" >&2
    fail "$label (expected exit=$expected_code actual=$actual_code)"
  fi
}

configure_repo() {
  repo_path=$1
  git -C "$repo_path" config user.name "Workspace Tests"
  git -C "$repo_path" config user.email "workspace-tests@example.invalid"
}

create_remote() {
  repo_name=$1
  seed_path="$TEST_ROOT/seeds/$repo_name"
  remote_path="$TEST_ROOT/remotes/$repo_name.git"
  mkdir -p "$seed_path" "$TEST_ROOT/remotes"
  git init --quiet --initial-branch=main "$seed_path"
  configure_repo "$seed_path"
  printf 'initial %s\n' "$repo_name" > "$seed_path/content.txt"
  git -C "$seed_path" add content.txt
  git -C "$seed_path" commit --quiet -m "chore: initial fixture"
  git clone --quiet --bare "$seed_path" "$remote_path"
  git -C "$seed_path" remote add origin "file://$remote_path"
  git -C "$seed_path" fetch --quiet origin
}

push_fixture_commit() {
  repo_name=$1
  message=$2
  seed_path="$TEST_ROOT/seeds/$repo_name"
  printf '%s\n' "$message" >> "$seed_path/content.txt"
  git -C "$seed_path" add content.txt
  git -C "$seed_path" commit --quiet -m "$message"
  git -C "$seed_path" push --quiet origin main
}

mkdir -p "$TEST_ROOT/seeds" "$TEST_ROOT/workspace"
create_remote repo-a
create_remote repo-b

MANIFEST="$TEST_ROOT/repos.yaml"
cat > "$MANIFEST" <<EOF
version: "1.0"
repositories:
  - name: repo-a
    folder: repo-a
    url: file://$TEST_ROOT/remotes/repo-a.git
    branch: main
    description: First fixture repository
  - name: repo-b
    folder: repo-b
    url: file://$TEST_ROOT/remotes/repo-b.git
    branch: main
    description: Second fixture repository
EOF

BOOTSTRAP_ARGS=(--root "$TEST_ROOT/workspace" --manifest "$MANIFEST" --allow-local-remotes)

run_expect 0 "manifest fixture validates" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --validate
run_expect 0 "missing repositories clone" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}"
assert_file "$TEST_ROOT/workspace/repo-a/.git/HEAD" "repo-a is an independent clone"
assert_file "$TEST_ROOT/workspace/repo-b/.git/HEAD" "repo-b is an independent clone"
assert_equal main "$(git -C "$TEST_ROOT/workspace/repo-a" branch --show-current)" "declared branch is checked out"

initial_head=$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)
run_expect 0 "clone mode is idempotent" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}"
assert_equal "$initial_head" "$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)" "idempotent run preserves HEAD"

push_fixture_commit repo-a "feat: remote fast-forward"
remote_head=$(git -C "$TEST_ROOT/seeds/repo-a" rev-parse HEAD)
run_expect 0 "clean default branch pulls" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull
assert_equal "$remote_head" "$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)" "clean clone fast-forwards"

dirty_head=$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)
printf 'uncommitted local work\n' > "$TEST_ROOT/workspace/repo-a/local-dirty.txt"
push_fixture_commit repo-a "feat: remote while dirty"
run_expect 2 "dirty worktree is safely skipped" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull
assert_equal "$dirty_head" "$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)" "dirty skip preserves HEAD"
assert_file "$TEST_ROOT/workspace/repo-a/local-dirty.txt" "dirty skip preserves local file"
rm "$TEST_ROOT/workspace/repo-a/local-dirty.txt"
run_expect 0 "cleaned worktree can catch up" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull

git -C "$TEST_ROOT/workspace/repo-a" checkout --quiet -b feature/local
wrong_branch_head=$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)
push_fixture_commit repo-a "feat: remote while feature branch checked out"
run_expect 2 "wrong branch is safely skipped" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull
assert_equal feature/local "$(git -C "$TEST_ROOT/workspace/repo-a" branch --show-current)" "pull does not switch branches"
assert_equal "$wrong_branch_head" "$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)" "wrong-branch skip preserves HEAD"
git -C "$TEST_ROOT/workspace/repo-a" checkout --quiet main
run_expect 0 "default branch catches up after manual checkout" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull

configure_repo "$TEST_ROOT/workspace/repo-a"
printf 'local committed work\n' >> "$TEST_ROOT/workspace/repo-a/content.txt"
git -C "$TEST_ROOT/workspace/repo-a" add content.txt
git -C "$TEST_ROOT/workspace/repo-a" commit --quiet -m "feat: local fixture divergence"
diverged_head=$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)
push_fixture_commit repo-a "feat: remote fixture divergence"
run_expect 2 "diverged history is safely skipped" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull
assert_equal "$diverged_head" "$(git -C "$TEST_ROOT/workspace/repo-a" rev-parse HEAD)" "divergence skip preserves local commit"

repo_b_head=$(git -C "$TEST_ROOT/workspace/repo-b" rev-parse HEAD)
git -C "$TEST_ROOT/workspace/repo-b" remote set-url origin "file://$TEST_ROOT/remotes/repo-a.git"
run_expect 1 "remote mismatch fails without rewrite" "$BOOTSTRAP" "${BOOTSTRAP_ARGS[@]}" --pull
assert_equal "file://$TEST_ROOT/remotes/repo-a.git" "$(git -C "$TEST_ROOT/workspace/repo-b" config --get remote.origin.url)" "remote mismatch is not rewritten"
assert_equal "$repo_b_head" "$(git -C "$TEST_ROOT/workspace/repo-b" rev-parse HEAD)" "remote mismatch preserves HEAD"

run_expect 1 "local remotes require explicit fixture opt-in" "$BOOTSTRAP" --root "$TEST_ROOT/workspace" --manifest "$MANIFEST" --validate

INVALID_MANIFEST="$TEST_ROOT/invalid-repos.yaml"
cat > "$INVALID_MANIFEST" <<EOF
version: "1.0"
repositories:
  - name: duplicate
    folder: duplicate
    url: file://$TEST_ROOT/remotes/repo-a.git
    branch: main
    description: First duplicate
  - name: duplicate
    folder: duplicate-two
    url: file://$TEST_ROOT/remotes/repo-b.git
    branch: main
    description: Second duplicate
EOF
run_expect 1 "duplicate manifest names are rejected" "$BOOTSTRAP" --root "$TEST_ROOT/workspace" --manifest "$INVALID_MANIFEST" --allow-local-remotes --validate

printf '\nAll %s bootstrap fixture assertions passed.\n' "$PASS_COUNT"
