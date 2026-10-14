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

assert_not_contains() {
  local unexpected="$1"
  local file="$2"
  if grep -Fqx -- "${unexpected}" "${file}"; then
    fail "did not expect '${unexpected}' in ${file}"
  fi
}

assert_contains 'ENV HOME=/home/node \' "${workspace}/.devcontainer/Dockerfile"
assert_contains '    PROVIDER_CLI_HOME=/home/node \' "${workspace}/.devcontainer/Dockerfile"

host_bin_directory="${temporary_directory}/installed-bin"
PROVIDER_CLI_HOST_BIN_DIR="${host_bin_directory}" \
  bash "${workspace}/.devcontainer/install-host-command.sh" >/dev/null 2>&1
[[ -L "${host_bin_directory}/__COMMAND_NAME__" ]] \
  || fail "installer did not create the __COMMAND_NAME__ symlink"

fake_bin_directory="${temporary_directory}/fake-bin"
capture_file="${temporary_directory}/docker-arguments"
image_state="${temporary_directory}/image-built"
mkdir -p "${fake_bin_directory}"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "NPX\n" >> "${PROVIDER_TEST_CAPTURE}"' \
  'exit 1' \
  > "${fake_bin_directory}/npx"
chmod +x "${fake_bin_directory}/npx"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'case "${1:-}" in' \
  '  image) [[ "${2:-}" == inspect && -f "${PROVIDER_TEST_IMAGE_STATE}" ]] ;;' \
  '  build)' \
  '    printf "DOCKER build\n" >> "${PROVIDER_TEST_CAPTURE}"' \
  '    for argument in "$@"; do printf "%s\n" "$argument"; done >> "${PROVIDER_TEST_CAPTURE}"' \
  '    printf "build output\n"' \
  '    if [[ "${PROVIDER_TEST_FAIL_BUILD:-false}" == true ]]; then exit 9; fi' \
  '    : > "${PROVIDER_TEST_IMAGE_STATE}"' \
  '    ;;' \
  '  run)' \
  '    printf "DOCKER run\n" >> "${PROVIDER_TEST_CAPTURE}"' \
  '    for argument in "$@"; do printf "%s\n" "$argument"; done >> "${PROVIDER_TEST_CAPTURE}"' \
  '    printf "{\"provider\":true}\n"' \
  '    ;;' \
  '  *) exit 1 ;;' \
  'esac' \
  > "${fake_bin_directory}/docker"
chmod +x "${fake_bin_directory}/docker"

run_host_gateway() {
  PATH="${fake_bin_directory}:${PATH}" \
    TMPDIR="${temporary_directory}" \
    PROVIDER_TEST_CAPTURE="${capture_file}" \
    PROVIDER_TEST_IMAGE_STATE="${image_state}" \
    "${host_bin_directory}/__COMMAND_NAME__" "$@"
}

expected_container_workspace="/workspaces/$(basename "${workspace}")"
: > "${capture_file}"
printf '%s' 'piped-value' | run_host_gateway gh auth status \
  >"${temporary_directory}/provider-stdout" 2>"${temporary_directory}/provider-stderr"

[[ "$(cat "${temporary_directory}/provider-stdout")" == '{"provider":true}' ]] \
  || fail "image build contaminated provider stdout"
assert_contains 'build output' "${temporary_directory}/provider-stderr"
assert_contains "DOCKER build" "${capture_file}"
assert_contains "${workspace}/.devcontainer/Dockerfile" "${capture_file}"
grep -Eq '^__PROJECT_SLUG__-provider-cli:[0-9a-f]{16}$' "${capture_file}" \
  || fail "host gateway did not tag the image by its Dockerfile"
assert_contains "DOCKER run" "${capture_file}"
assert_contains "--rm" "${capture_file}"
assert_contains "type=bind,source=${workspace},target=${expected_container_workspace}" "${capture_file}"
assert_contains "type=volume,source=__CONFIG_VOLUME__,target=/home/node/.config" "${capture_file}"
assert_contains "PROVIDER_CLI_WORKSPACE=${expected_container_workspace}" "${capture_file}"
assert_contains "${expected_container_workspace}/.devcontainer/bin/__COMMAND_NAME__" "${capture_file}"
assert_contains "gh" "${capture_file}"
assert_not_contains "--interactive" "${capture_file}"
assert_not_contains "NPX" "${capture_file}"
if grep -Eq '^(COPY|ADD) ' "${workspace}/.devcontainer/Dockerfile"; then
  fail "the provider image is tagged by its Dockerfile alone and must not copy build context"
fi

: > "${capture_file}"
run_host_gateway gh auth status </dev/null >/dev/null 2>&1
assert_not_contains "DOCKER build" "${capture_file}"
assert_contains "DOCKER run" "${capture_file}"

rm -f "${image_state}"
: > "${capture_file}"
if PROVIDER_TEST_FAIL_BUILD=true run_host_gateway doctor </dev/null >/dev/null 2>&1; then
  fail "host gateway ignored a failed provider image build"
fi
assert_not_contains "DOCKER run" "${capture_file}"

workspace_key="$(printf '%s' "${workspace}" | cksum | awk '{print $1}')"
gateway_lock="${temporary_directory}/__COMMAND_NAME__-${workspace_key}.lock"
run_host_gateway gh auth status </dev/null >/dev/null 2>&1
[[ ! -e "${gateway_lock}" ]] || fail "host gateway kept the provider lock after a command"
mkdir "${gateway_lock}"
: > "${capture_file}"
if run_host_gateway gh auth status </dev/null >/dev/null 2>&1; then
  fail "host gateway ignored the serialized provider lock"
fi
[[ ! -s "${capture_file}" ]] || fail "locked host gateway invoked a provider process"
run_host_gateway doctor </dev/null >/dev/null 2>&1 \
  || fail "read-only doctor waited on the provider lock"
assert_contains "DOCKER run" "${capture_file}"
[[ -d "${gateway_lock}" ]] || fail "a read-only command released another command's provider lock"
rmdir "${gateway_lock}"

PROVIDER_CLI_WORKSPACE="${workspace}" \
  "${workspace}/.devcontainer/bin/__COMMAND_NAME__" --help >/dev/null

provider_bin="${temporary_directory}/provider-bin"
provider_capture="${temporary_directory}/provider-arguments"
provider_home="${temporary_directory}/provider-home"
mkdir -p "${provider_bin}" "${provider_home}"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'printf "COMMAND %s\n" "${0##*/}" >> "${PROVIDER_TEST_CAPTURE}"' \
  'printf "HOME %s\n" "${HOME:-}" >> "${PROVIDER_TEST_CAPTURE}"' \
  'for argument in "$@"; do printf "ARG %s\n" "$argument"; done >> "${PROVIDER_TEST_CAPTURE}"' \
  'if [[ "${0##*/}" == gws && "${1:-}" == auth && "${2:-}" == login ]]; then' \
  '  printf '\''{"account":"%s"}\n'\'' "${PROVIDER_TEST_GWS_LOGIN_ACCOUNT:-workspace@example.com}"' \
  'fi' \
  > "${provider_bin}/provider-command"
chmod +x "${provider_bin}/provider-command"
for command_name in gcloud gws; do
  ln -s "${provider_bin}/provider-command" "${provider_bin}/${command_name}"
done

run_provider() {
  PATH="${provider_bin}:${PATH}" \
  HOME="${temporary_directory}/unrelated-home" \
  PROVIDER_CLI_HOME="${provider_home}" \
  PROVIDER_CLI_WORKSPACE="${workspace}" \
  PROVIDER_GCP_ACCOUNT_EMAIL="cloud@example.com" \
  PROVIDER_GCP_PROJECT="example-project" \
  PROVIDER_GOOGLE_WORKSPACE_ACCOUNT_EMAIL="workspace@example.com" \
  PROVIDER_TEST_CAPTURE="${provider_capture}" \
  PROVIDER_TEST_GWS_LOGIN_ACCOUNT="${PROVIDER_TEST_GWS_LOGIN_ACCOUNT:-workspace@example.com}" \
    "${workspace}/.devcontainer/bin/__COMMAND_NAME__" "$@"
}

: > "${provider_capture}"
run_provider gcloud compute instances list
assert_contains "COMMAND gcloud" "${provider_capture}"
assert_contains "HOME ${provider_home}" "${provider_capture}"
assert_contains "ARG --account" "${provider_capture}"
assert_contains "ARG cloud@example.com" "${provider_capture}"
assert_contains "ARG --project" "${provider_capture}"
assert_contains "ARG example-project" "${provider_capture}"

: > "${provider_capture}"
run_provider gcloud login
assert_contains "ARG login" "${provider_capture}"
assert_contains "ARG application-default" "${provider_capture}"
assert_contains "ARG --no-launch-browser" "${provider_capture}"

: > "${provider_capture}"
run_provider gws login --services drive,sheets >/dev/null
assert_contains "COMMAND gws" "${provider_capture}"
assert_contains "ARG auth" "${provider_capture}"
assert_contains "ARG login" "${provider_capture}"
assert_contains "ARG --services" "${provider_capture}"
assert_contains "ARG drive,sheets" "${provider_capture}"

: > "${provider_capture}"
run_provider gws status
assert_contains "ARG auth" "${provider_capture}"
assert_contains "ARG status" "${provider_capture}"

: > "${provider_capture}"
if PROVIDER_TEST_GWS_LOGIN_ACCOUNT="wrong@example.com" run_provider gws login >/dev/null 2>&1; then
  fail "provider wrapper accepted the wrong Google Workspace account"
fi
assert_contains "ARG logout" "${provider_capture}"

if run_provider gws auth export --unmasked >/dev/null 2>&1; then
  fail "provider wrapper exposed raw Google Workspace credential export"
fi

if run_provider gswitch list >/dev/null 2>&1; then
  fail "provider wrapper exposed an account switcher"
fi

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
