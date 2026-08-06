---
name: provider-cli-container
description: Design, initialize, operate, and validate a short-lived Dev Container used only for pinned provider CLIs and project-scoped cloud accounts. Use when a repository needs isolated access to services such as Vercel, EAS, hosted Supabase, PostHog, Google Cloud, gswitch, or GitHub; when migrating provider credentials away from host-global profiles; when deciding whether work belongs in the provider container, a purpose-built test runner, or the host toolchain; or when troubleshooting an existing provider CLI gateway.
---

# Provider CLI Container

Treat the container as an account and CLI-version boundary, not as the project's development environment. Keep its lifecycle short, its command surface allowlisted, and its persisted state limited to provider configuration.

## Choose the execution lane

| Work | Lane |
| --- | --- |
| Hosted provider inspection or mutation through pinned CLIs | Provider CLI container |
| Project dependencies, builds, lint, unit tests, repository scripts, or local development | Host or current agent host image |
| Local databases, browsers, or integration/e2e services | Host or a purpose-built, self-cleaning runner |
| Xcode, CocoaPods, Gradle, Android SDK, ADB, simulators, emulators, devices, or native UI automation | Native host toolchain |

Never add a Docker socket, Docker-in-Docker, browsers, local databases, project dependency volumes, or native SDKs merely to make the provider container more convenient. Create a separate runner when a workflow genuinely needs those capabilities.

## Initialize a new project

1. Inventory the exact provider CLIs, accounts, organizations, projects, and repositories the project needs. Prefer the smallest provider set.
2. Choose a lowercase command name such as `acme-dev`. Keep it project-specific so host commands cannot silently address the wrong repository.
3. From this skill directory, render the starter scaffold into a project that does not already have `.devcontainer/`:

   ```sh
   python3 scripts/init_provider_cli.py \
     --project-root /absolute/path/to/project \
     --project-name "Acme" \
     --command acme-dev
   ```

   Use `--dry-run` first when reviewing the destination. The initializer refuses to overwrite an existing `.devcontainer/`; merge manually after inspecting both configurations.
4. Read [design-and-customization.md](references/design-and-customization.md). Remove unused CLIs and wrapper cases, update the retained version pins and binary checksums, and set explicit target guards in `devcontainer.json`.
5. Customize the generated `.devcontainer/secrets.env.example` with key names only. Keep real values in ignored `secrets.env` with mode `600`.
6. Run the generated lifecycle test, build the image, install the host command, and inspect the doctor output:

   ```sh
   bash .devcontainer/tests/<command>.test.sh
   npx --yes @devcontainers/cli@0.80.2 build --workspace-folder .
   bash .devcontainer/install-host-command.sh
   <command> doctor
   ```

7. Add a short mandatory trigger to the repository's agent instructions so provider tasks load this skill or the project-specific runbook before running cloud commands.

The scaffold intentionally includes a common provider set as a starting point. Initialization is not complete until unused providers are removed and every retained mutation target can be verified.

## Use an existing gateway

1. Read the repository's `.devcontainer/README.md` and agent instructions for its command name, providers, accounts, and target guards.
2. Prefer the current worktree's checked-in host gateway over a global symlink:

   ```sh
   project_root="$(git rev-parse --show-toplevel)"
   provider_gateway="${project_root}/.devcontainer/bin/<command>-host"
   ```

3. Run `"${provider_gateway}" doctor` only when the task needs provider access.
4. Before mutations, run the provider's read-only identity and target checks. Do not infer identity from a browser session or host-global CLI profile.
5. Execute the requested allowlisted provider command through the gateway. Never expose tokens or raw credential output.
6. Verify the resulting state with the smallest read-only command that proves success.

If the wrapper rejects an arbitrary command, interactive shell, or local-service operation, reroute the work to the correct lane instead of weakening the guard.

## Handle credentials and lifecycle

- Prefer project- or organization-scoped tokens and robot users over personal broad-scope credentials.
- Load only the selected provider's credential variables into a command.
- Persist interactive CLI configuration in one project-specific named volume; do not persist dependency or database state.
- Remove the config volume only for an explicit login reset. Explain that it signs out the project's stored provider accounts.
- Start the container on demand, use the Docker host's native architecture, and remove command-created containers when the command exits.
- Serialize concurrent gateway commands per worktree so two agents cannot race on the same provider configuration.
