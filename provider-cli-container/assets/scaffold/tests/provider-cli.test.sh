#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace="$(cd "${script_directory}/../.." && pwd -P)"
temporary_directory="$(mktemp -d)"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fqx -- "${expected}" "${file}" || fail "expected '${expected}' in ${file}"
}

host_bin_directory="${temporary_directory}/installed-bin"
PROVIDER_CLI_HOST_BIN_DIR="${host_bin_directory}" \
  bash "${workspace}/.devcontainer/install-host-command.sh" >/dev/null 2>&1
[[ -L "${host_bin_directory}/__COMMAND_NAME__" ]] \
  || fail "installer did not create the __COMMAND_NAME__ symlink"

fake_bin_directory="${temporary_directory}/fake-bin"
capture_file="${temporary_directory}/npx-arguments"
container_state="${temporary_directory}/container-state"
stop_capture="${temporary_directory}/docker-stop"
mkdir -p "${fake_bin_directory}"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'if [[ "$3" == "up" ]]; then' \
  '  : > "${PROVIDER_TEST_CONTAINER_STATE}"' \
  '  if [[ "${PROVIDER_TEST_FAIL_UP:-}" == true ]]; then exit 9; fi' \
  'fi' \
  'printf "CALL %s\n" "$3" >> "${PROVIDER_TEST_CAPTURE}"' \
  'for argument in "$@"; do printf "%s\n" "$argument"; done >> "${PROVIDER_TEST_CAPTURE}"' \
  > "${fake_bin_directory}/npx"
chmod +x "${fake_bin_directory}/npx"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'case "${1:-}" in' \
  '  ps) if [[ -f "${PROVIDER_TEST_CONTAINER_STATE}" ]]; then printf "%s\n" "test-container-id"; fi ;;' \
  '  stop) printf "%s\n" "${2:-}" > "${PROVIDER_TEST_STOP_CAPTURE}"; rm -f "${PROVIDER_TEST_CONTAINER_STATE}" ;;' \
  '  *) exit 1 ;;' \
  'esac' \
  > "${fake_bin_directory}/docker"
chmod +x "${fake_bin_directory}/docker"

PATH="${fake_bin_directory}:${PATH}" \
TMPDIR="${temporary_directory}" \
PROVIDER_TEST_CAPTURE="${capture_file}" \
PROVIDER_TEST_CONTAINER_STATE="${container_state}" \
PROVIDER_TEST_STOP_CAPTURE="${stop_capture}" \
  "${host_bin_directory}/__COMMAND_NAME__" gh auth status

assert_contains "CALL up" "${capture_file}"
assert_contains "@devcontainers/cli@0.80.2" "${capture_file}"
assert_contains "--remove-existing-container" "${capture_file}"
assert_contains "CALL exec" "${capture_file}"
assert_contains "__COMMAND_NAME__" "${capture_file}"
assert_contains "gh" "${capture_file}"
[[ "$(cat "${stop_capture}")" == "test-container-id" ]] \
  || fail "host gateway did not stop its short-lived container"
[[ ! -e "${container_state}" ]] \
  || fail "short-lived container state remained after the command"

: > "${stop_capture}"
if PATH="${fake_bin_directory}:${PATH}" \
  TMPDIR="${temporary_directory}" \
  PROVIDER_TEST_CAPTURE="${capture_file}" \
  PROVIDER_TEST_CONTAINER_STATE="${container_state}" \
  PROVIDER_TEST_FAIL_UP=true \
  PROVIDER_TEST_STOP_CAPTURE="${stop_capture}" \
  "${host_bin_directory}/__COMMAND_NAME__" doctor >/dev/null 2>&1; then
  fail "host gateway ignored a failed provider container startup"
fi
[[ "$(cat "${stop_capture}")" == "test-container-id" ]] \
  || fail "host gateway did not clean up a failed startup"
[[ ! -e "${container_state}" ]] \
  || fail "failed startup left provider container state behind"

PROVIDER_CLI_WORKSPACE="${workspace}" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" --help >/dev/null

if PROVIDER_CLI_WORKSPACE="${workspace}" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" shell >/dev/null 2>&1; then
  fail "provider wrapper allowed an interactive shell"
fi

if PROVIDER_CLI_WORKSPACE="${workspace}" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" /bin/true >/dev/null 2>&1; then
  fail "provider wrapper allowed an arbitrary executable"
fi

if PROVIDER_CLI_WORKSPACE="${workspace}" \
  PROVIDER_SUPABASE_PROJECT_REF="test-project" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" supabase start >/dev/null 2>&1; then
  fail "provider wrapper allowed local Supabase services"
fi

if PROVIDER_CLI_WORKSPACE="${workspace}" \
  PROVIDER_GITHUB_REPOSITORY="SET_ME_OR_REMOVE" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" gh auth status >/dev/null 2>&1; then
  fail "provider wrapper allowed an unconfigured target"
fi

insecure_secrets_file="${temporary_directory}/insecure-secrets.env"
printf '%s\n' 'GH_TOKEN=not-a-real-token' > "${insecure_secrets_file}"
chmod 644 "${insecure_secrets_file}"
if PROVIDER_CLI_WORKSPACE="${workspace}" \
  PROVIDER_CLI_SECRETS_FILE="${insecure_secrets_file}" \
  PROVIDER_GITHUB_REPOSITORY="owner/repository" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" gh auth status >/dev/null 2>&1; then
  fail "provider wrapper allowed an insecure secrets file"
fi

conflict_directory="${temporary_directory}/conflict-bin"
mkdir -p "${conflict_directory}"
printf '%s\n' '#!/usr/bin/env bash' > "${conflict_directory}/__COMMAND_NAME__"
if PROVIDER_CLI_HOST_BIN_DIR="${conflict_directory}" \
  bash "${workspace}/.devcontainer/install-host-command.sh" >/dev/null 2>&1; then
  fail "installer replaced an existing host command"
fi

echo "__COMMAND_NAME__ tests passed"
