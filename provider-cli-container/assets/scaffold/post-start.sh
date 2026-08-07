#!/usr/bin/env bash

set -euo pipefail

workspace="${PROVIDER_CLI_WORKSPACE:-__WORKSPACE_DIR__}"
provider_home="${PROVIDER_CLI_HOME:-/home/node}"

sudo mkdir -p "${provider_home}/.config"
sudo chown -R "$(id -u):$(id -g)" "${provider_home}/.config"

secrets_file="${PROVIDER_CLI_SECRETS_FILE:-${workspace}/.devcontainer/secrets.env}"
if [[ -f "${secrets_file}" ]]; then
  chmod 600 "${secrets_file}"
fi
