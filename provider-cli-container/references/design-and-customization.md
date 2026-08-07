# Design And Customization

## Contents

1. Required invariants
2. New-project decisions
3. Provider patterns
4. Credentials and account state
5. Validation
6. Extending the scaffold

## Required invariants

Keep these properties when adapting the scaffold:

- **Narrow purpose:** provider CLIs and provider account state only.
- **Allowlisted entrypoint:** accept named provider commands; reject shells and arbitrary executables.
- **Explicit targets:** record the expected organization, project, repository, or project ref and verify it before mutations.
- **Scoped secrets:** ignore the real secret file, require owner-only permissions, and export only keys used by the selected provider.
- **Ephemeral lifecycle:** use `--rm`; stop command-created containers after each host-gateway invocation.
- **Native architecture:** select `arm64` or `amd64` downloads using `TARGETARCH`; verify downloaded binaries with SHA-256.
- **Minimal persistence:** retain one project-specific CLI config volume and nothing else.
- **Single native identity:** use each provider CLI's own credential slot; do not add an account switcher inside the container.
- **No Docker authority:** do not mount the Docker socket or install Docker-in-Docker.
- **Worktree safety:** resolve the gateway from the current worktree when correctness depends on checked-in configuration.
- **Conflict safety:** never overwrite an unrelated command already present in the host install directory.

## New-project decisions

Before editing the generated scaffold, write down:

| Decision | Example shape |
| --- | --- |
| Host command | `<project>-dev` |
| Provider set | `github`, `vercel`, `gcloud` |
| Expected identities | human email, robot user, or organization |
| Guarded targets | repository, team, project, account, region |
| Secret keys | provider-specific token names only |
| Persisted config | one `<project>-provider-cli-config` volume |
| Host-only work | builds, tests, local services, native tooling |
| Separate runners | database/browser e2e or other service stacks |

Delete every unused CLI install, secret key, doctor line, usage line, and wrapper case. A small container is easier to audit and less likely to become a general-purpose environment.

## Provider patterns

| Provider | Target guard | Identity check | Credential pattern |
| --- | --- | --- | --- |
| Vercel | Force the intended scope/team; inspect the project before deployment | `vercel whoami` | Scoped `VERCEL_TOKEN` or project-volume login |
| EAS | Compare `eas project:info` with the expected owner/project before cloud builds or updates | `eas whoami` | Project-restricted `EXPO_TOKEN` or robot user |
| Hosted Supabase | Guard the linked project ref; reject local lifecycle and test commands | `supabase projects list` | `SUPABASE_ACCESS_TOKEN` for explicit hosted operations |
| PostHog | Select an explicit application directory and project ID/host | CLI help or an available read-only project command | Personal/project API key only for source maps or symbols |
| Google Cloud | Force the intended `--account` and `--project` | `gcloud auth list --filter=status:ACTIVE` | Direct `gcloud auth login` plus `gcloud auth application-default login` in the project volume |
| Google Workspace | Keep one `gws` credential slot and reject raw auth/export bypasses | Validate the account returned by `gws auth login`; inspect `gws auth status` | Direct `gws auth login`, a securely transferred credential file for headless hosts, or a service account |
| GitHub | Set or verify the expected `owner/repository`, especially in linked worktrees | `gh auth status` and `gh repo view <owner/repository>` | Project-volume login or a least-privilege token |

Provider CLIs change. Verify command syntax and authentication behavior against primary documentation when adapting a project, especially before adding mutation automation.

## Credentials and account state

Use `secrets.env.example` only as a list of accepted key names and comments. Keep `secrets.env` ignored and mode `600`. Parse it as data rather than sourcing it into a shell; reject malformed entries and never print values.

Let interactive logins write to provider-specific config paths under the named volume. Avoid host-global profiles because they make the active account depend on unrelated work. A reset should delete only this named config volume and should never touch application data, databases, or dependency caches.

For browserless Google Cloud login, prefer `--no-launch-browser` and complete the printed authorization-code flow on a trusted browser machine. `gws auth login` requires a localhost browser callback; on a genuinely headless host, follow the native `gws auth export --unmasked` credential-file flow on a trusted browser machine or use a service account. Treat the exported file as a secret, transfer it without logging its contents, store it as `<provider-home>/.config/gws/credentials.json` in the project config volume with mode `600`, and delete the transfer copy after verifying `gws auth status`.

## Validation

Require evidence for these behaviors:

1. The host installer creates the intended symlink and refuses unrelated conflicts.
2. The host gateway uses the pinned Dev Containers CLI, starts on demand, forwards arguments, and stops command-created containers.
3. A startup failure still cleans up a partially created container.
4. The in-container wrapper rejects an interactive shell, arbitrary executable, and local database/service commands.
5. Secret permission failures stop before a provider command starts.
6. Target mismatches fail closed.
7. The image builds on every host architecture the team supports.
8. `doctor` reports pinned versions and expected targets without revealing secret values.
9. A real read-only provider command leaves no stopped command-created container behind.

Do not treat a successful image build as account validation. Run provider-specific identity and target checks separately.

## Extending the scaffold

To add a provider:

1. Pin its CLI version in `Dockerfile`.
2. For downloaded binaries, select architecture explicitly and verify checksums.
3. Add a single allowlisted wrapper case and usage entry.
4. Load only that provider's credential keys.
5. Add doctor version and target lines without exposing secrets.
6. Add identity and target-verification commands to the generated runbook.
7. Extend lifecycle/guard tests before using mutation commands.

If a provider requires browsers, a local service stack, privileged Docker access, or a native SDK, keep the provider account CLI here and put the heavier workflow in a separate purpose-built runner.
