#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace="$(cd "${script_directory}/.." && pwd -P)"
host_command="${workspace}/.devcontainer/bin/__COMMAND_NAME__-host"
host_bin_directory="${PROVIDER_CLI_HOST_BIN_DIR:-${HOME}/.local/bin}"

mkdir -p "${host_bin_directory}"

repository_target_identity() {
  local target="$1"
  local target_directory
  local target_name
  local checkout_root
  local common_directory

  target_directory="$(cd "$(dirname "${target}")" && pwd -P)" || return 1
  target_name="$(basename "${target}")"
  checkout_root="$(git -C "${target_directory}" rev-parse --show-toplevel 2>/dev/null)" || return 1
  common_directory="$(git -C "${checkout_root}" rev-parse --git-common-dir 2>/dev/null)" || return 1
  if [[ "${common_directory}" != /* ]]; then
    common_directory="$(cd "${checkout_root}/${common_directory}" && pwd -P)"
  fi
  printf '%s\t%s\n' \
    "${common_directory}" \
    "${target_directory#"${checkout_root}"/}/${target_name}"
}

command_path="${host_bin_directory}/__COMMAND_NAME__"
if [[ -e "${command_path}" || -L "${command_path}" ]]; then
  if [[ -L "${command_path}" && "$(readlink "${command_path}")" == "${host_command}" ]]; then
    echo "Host command is already installed at ${command_path}."
    exit 0
  fi

  if [[ -L "${command_path}" ]]; then
    existing_target="$(readlink "${command_path}")"
    if [[ "${existing_target}" != /* ]]; then
      existing_target="$(cd "$(dirname "${command_path}")/$(dirname "${existing_target}")" && pwd -P)/$(basename "${existing_target}")"
    fi
    existing_identity="$(repository_target_identity "${existing_target}" || true)"
    target_identity="$(repository_target_identity "${host_command}" || true)"
    if [[ -n "${existing_identity}" && "${existing_identity}" == "${target_identity}" ]]; then
      echo "Host command is already installed for this repository at ${command_path}."
      exit 0
    fi
  fi

  echo "Refusing to replace the existing host command at ${command_path}." >&2
  exit 1
fi

ln -s "${host_command}" "${command_path}"
echo "Installed __PROJECT_NAME__ provider command at ${command_path}."

case ":${PATH}:" in
  *":${host_bin_directory}:"*) ;;
  *) echo "Add ${host_bin_directory} to PATH before running __COMMAND_NAME__." >&2 ;;
esac
