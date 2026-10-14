# __PROJECT_NAME__ Provider CLI Container

This Dev Container has one narrow purpose: pin hosted-provider CLI versions and isolate the accounts and configuration used by this project. It is not a general development environment.

## Customize before use

1. Remove unused provider installs from `Dockerfile` and their cases, usage lines, secrets, and doctor output from `bin/__COMMAND_NAME__`.
2. Replace every `SET_ME_OR_REMOVE` target in the `Dockerfile` `ENV` block for retained providers.
3. Review every retained CLI version and architecture checksum.
4. Document the expected human or robot identity for each provider without storing secrets here.
5. Extend `tests/__COMMAND_NAME__.test.sh` for project-specific target guards.

## Boundary

Use `__COMMAND_NAME__` only for the allowlisted hosted provider CLIs. Run dependencies, builds, tests, local databases, browsers, and native tooling on the host or in a separate purpose-built runner. Do not add a Docker socket, Docker-in-Docker, project dependency volumes, browsers, databases, or native SDKs to this image.

The host gateway runs each command in its own `docker run --rm` container. The image is tagged by a hash of the `Dockerfile` and built only when that tag is missing, so every worktree with the same definition shares it; the `Dockerfile` therefore copies nothing from its build context. Read-only commands such as `doctor` run concurrently; every other command holds a per-worktree lock. `devcontainer.json` remains for opening the image in an editor. The `__CONFIG_VOLUME__` volume persists only project-scoped CLI configuration.

## Install and inspect

```sh
bash .devcontainer/tests/__COMMAND_NAME__.test.sh
bash .devcontainer/install-host-command.sh
__COMMAND_NAME__ doctor
```

Use the current worktree's `.devcontainer/bin/__COMMAND_NAME__-host` directly when a globally installed symlink might point at another worktree.

## Credentials

```sh
cp .devcontainer/secrets.env.example .devcontainer/secrets.env
chmod 600 .devcontainer/secrets.env
```

Keep only required credential keys. The real file is ignored and must never be printed or committed. Interactive CLI state persists in the project-specific config volume.

Each retained Google provider has one native credential slot in this project's volume. Use `gcloud` and `gws` directly; do not add an account switcher. Configure the intended Google account email in the `Dockerfile` `ENV` block, then authenticate with:

```sh
__COMMAND_NAME__ gcloud login
__COMMAND_NAME__ gcloud status
__COMMAND_NAME__ gws login --services drive,sheets
__COMMAND_NAME__ gws status
```

`gcloud login` uses authorization-code URLs suitable for a browserless container. `gws auth login` requires a localhost callback and an OAuth Desktop client. On a genuinely headless host, authenticate with `gws` on a trusted browser machine and use its native unmasked export flow to create a credential file. Transfer it without printing it, store it as `/home/node/.config/gws/credentials.json` in this project's config volume with mode `600`, delete the transfer copy after `gws status` succeeds, and prefer a service account for unattended automation.

## Provider workflow

Before a mutation, verify both identity and target with read-only commands such as:

```sh
__COMMAND_NAME__ vercel whoami
__COMMAND_NAME__ eas whoami
__COMMAND_NAME__ supabase projects list
__COMMAND_NAME__ gcloud status
__COMMAND_NAME__ gws status
__COMMAND_NAME__ gh auth status
__COMMAND_NAME__ gh repo view <owner/repository> --json nameWithOwner
```

Use `--cwd relative/path` before the provider when its configuration lives below the repository root.

## Reset

To reset provider logins, remove only the `__CONFIG_VOLUME__` Docker volume. This signs out stored CLI accounts; it must not affect application data, databases, or dependency caches.
