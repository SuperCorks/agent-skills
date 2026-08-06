#!/usr/bin/env bash

set -euo pipefail

workspace="${PROVIDER_CLI_WORKSPACE:-__WORKSPACE_DIR__}"

bash "${workspace}/.devcontainer/post-start.sh"

echo
echo "__PROJECT_NAME__ provider CLI container is ready."
echo "Run project builds, tests, local services, and native tooling outside it."
