#!/usr/bin/env bash

set -euo pipefail

workspace="${PROVIDER_CLI_WORKSPACE:-__WORKSPACE_DIR__}"

sudo mkdir -p /home/node/.config
sudo chown -R "$(id -u):$(id -g)" /home/node/.config

secrets_file="${PROVIDER_CLI_SECRETS_FILE:-${workspace}/.devcontainer/secrets.env}"
if [[ -f "${secrets_file}" ]]; then
  chmod 600 "${secrets_file}"
fi
