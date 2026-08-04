---
name: remote-hosts
description: Connect to and operate Simon's persistent remote coding workspaces over SSH. Use when an agent needs to inspect or troubleshoot a remote host, work with repositories or Codex/Claude/OpenCode, use the rootless Docker sidecar or Dev Containers, forward a development port, request a Codex phone pairing code, or coordinate lifecycle, checkpoint, restore, key, or image-upgrade work for a host such as sim.agents.hoptech.ca.
---

# Remote Hosts

Use the local OpenSSH configuration as the source of connection details. Run
remote commands through the configured host name; never read, print, copy, or
embed the corresponding private key.

## Host inventory

### `sim.agents.hoptech.ca`

- Purpose: Simon's persistent, container-isolated agentic engineering machine.
- Platform: a Dokploy-managed Docker workload on the HOP Tech NixOS server.
- SSH config: `agent@sim.agents.hoptech.ca:22000`.
- Local identity: `~/.ssh/sim_agents_hoptech_ca`, referenced by
  `~/.ssh/config`; never access its contents.
- Host-key fingerprint:
  `SHA256:fuOuFDWj574xtMzokY8tHYGmwvQHMXk483B2okvn8yI`.
- Privilege model: log in as non-root user `agent`; do not expect `sudo`.
- Backup-covered persistent storage:
  - `/home/agent` for credentials, CLI state, and user configuration.
  - `/workspaces` for Git repositories and engineering work.
  - `/var/lib/agent-machine` for machine identity and SSH host-key state.
- Rebuildable persistent Docker state: the dedicated daemon's data, TLS
  material, and plugins survive ordinary stop/start but are excluded from
  encrypted checkpoints.
- Existing project: `/workspaces/champs`, cloned from
  `https://github.com/SuperCorks/Champs.git`.
- Tools include Codex, Claude Code, OpenCode, GitHub CLI, Node/fnm, Python/uv,
  Go, Rust/Cargo/rustup, Google Cloud CLI, `gws`, `gswitch`, `curl`, and Docker
  CLI.
- Docker uses a persistent TLS-connected rootless daemon sidecar. Use `docker`
  directly as `agent`, not through `sudo`; it cannot access the NixOS host,
  Dokploy, or another owner's containers.
- Codex, Claude Code, and OpenCode have a guarded daily updater. It skips all
  updates while any coding-agent session is active or its status is uncertain.

## Verify SSH trust and connect

The expected local stanza uses a dedicated identity, `IdentitiesOnly yes`,
`StrictHostKeyChecking yes`, and
`UserKnownHostsFile ~/.ssh/hop-agent-machines_known_hosts`. Confirm the
effective configuration and test non-interactive access:

```bash
ssh -G sim.agents.hoptech.ca
ssh -o BatchMode=yes sim.agents.hoptech.ca true
```

Verify the installed operator-issued receipt without contacting an untrusted
endpoint for a replacement key:

```bash
ssh-keygen -F '[sim.agents.hoptech.ca]:22000' \
  -f ~/.ssh/hop-agent-machines_known_hosts \
  | awk '$1 !~ /^#/' | ssh-keygen -lf -
```

Do not use `ssh-keyscan` or accept a first-use prompt blindly. If the key is
missing, request the operator-issued receipt. If it differs, stop and treat it
as an incident; never remove or replace the known-host entry as a workaround.

## Inspect the host

Run commands through the login shell so owner-installed tools are on `PATH`:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'cd /workspaces/champs && git status --short --branch'"
ssh sim.agents.hoptech.ca "bash -lc 'rustc --version; cargo --version; codex --version; claude --version; opencode --version; docker version'"
```

Use `ssh -t sim.agents.hoptech.ca` only for a command that needs a terminal.
Keep complex scripts local or transfer a reviewed script explicitly rather
than constructing fragile nested shell quoting.

If SSH fails, report the resolved host, user, port, and error. Do not disable
strict host-key checking, rotate keys, or expose a new port unless the user
explicitly requests the corresponding infrastructure change.

## Work with repositories

Prefer Git over copying a local workspace. Before changing an existing checkout:

1. Run `git status --short --branch`.
2. Preserve remote user changes; never reset, clean, or overwrite them.
3. Inspect the remotes and current branch.
4. Fetch or pull only when compatible with the working-tree state and the
   user's request.

For a new private GitHub checkout:

```bash
ssh sim.agents.hoptech.ca "bash -lc '
  gh auth status &&
  gh repo clone OWNER/REPO /workspaces/NAME
'"
```

Place repositories under `/workspaces`. Install dependencies fresh on the
remote host. Do not copy ignored local build output or secret `.env` files
unless the user explicitly asks to transfer the specific files.

## Use remote development tools

Run tool checks or non-interactive commands through the remote login shell:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'codex --version; claude --version; opencode --version'"
ssh sim.agents.hoptech.ca "bash -lc 'rustup --version; rustc --version; cargo --version; docker info'"
```

For interactive work, SSH into the host, change to the repository, and launch
the desired CLI. For Codex Desktop, use **Settings > Connections**, enable the
concrete SSH host `sim.agents.hoptech.ca`, and choose the remote project folder.
The desktop app starts its remote app server through SSH.

### Nested Docker and Dev Containers

The workstation and sidecar share the persistent `/workspaces` mount, so
nested containers can bind-mount the same absolute repository paths. SSH
exports `DEVCONTAINER_REMOTE_USER=root` because root inside a nested rootless
container maps back to the unprivileged `agent` owner. Prefer this Dev
Container setting when the repository supports a non-remote fallback:

```json
"remoteUser": "${localEnv:DEVCONTAINER_REMOTE_USER:node}"
```

A workstation process listens on the workstation loopback. A port published by
nested Docker listens in the sidecar network namespace at hostname `docker`:

```bash
ssh -L 3000:127.0.0.1:3000 sim.agents.hoptech.ca
ssh -L 3001:docker:3000 sim.agents.hoptech.ca
```

Keep Dockerfiles, Compose files, and irreplaceable application data under
`/workspaces`; Docker daemon state is persistent operational state but is not
included in encrypted checkpoints.

### Guarded agent CLI updates

The updater runs daily at 04:17 UTC with up to 30 minutes of jitter. It fails
closed and updates nothing when any supported agent is active or its state is
unknown. Inspect it without bypassing the guard:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'agent-cli-update --check-only'"
ssh sim.agents.hoptech.ca "bash -lc 'tail -n 100 ~/.local/state/agent-machine/cli-update.log'"
```

Run `agent-cli-update --no-jitter` only when the user asks for an immediate
guarded update. The current and previous capped logs are
`cli-update.log` and `cli-update.log.1` in that state directory.

### Codex phone access

For Codex Desktop or phone access, first inspect the managed lifecycle:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'agent-remote-control status'"
ssh sim.agents.hoptech.ca "bash -lc 'agent-remote-control enable'"
ssh sim.agents.hoptech.ca "bash -lc 'codex remote-control pair --json'"
ssh sim.agents.hoptech.ca "bash -lc 'agent-remote-control disable'"
```

When the machine manifest opts in to Remote Control auto-start, `enable`
starts it now and allows it to restart after container start/recreation.
`disable` stops it and persists an owner override in the home volume so later
rebuilds keep it off. Plain `codex remote-control stop --json` is only a
temporary stop and should not be used when the user's intent must survive a
rebuild. If an older image lacks `agent-remote-control`, fall back to
`codex remote-control start --json` and tell the user the start is not durable.

Return only `manualPairingCode` and the human-readable `expiresAt` time to the
user. Treat pairing codes as short-lived credentials. Never expose the Codex
app-server socket or transport on a public network.

## Coordinate lifecycle and infrastructure work

The source of truth is the private
`HOP-Tech-Canada/infra-nixos-server` repository, not an application repository
such as Champs. Read the applicable runbook before operator work:

- `docs/runbooks/agent-machines.md` for status, creation, keys, upgrades, and
  lifecycle.
- `docs/runbooks/agent-machine-owner.md` for owner behavior.
- `docs/runbooks/agent-machine-incident.md` for compromise or host-key alerts.
- `docs/runbooks/agent-machine-backup-restore.md` for checkpoints and restores.

Lifecycle semantics are intentionally unusual:

- `destroy` is a reversible stop. It preserves files, volumes, port, and host
  identity, but processes, tmux sessions, agents, dev servers, and nested
  containers do not survive. A manifest-enabled Codex Remote Control daemon is
  relaunched automatically unless the owner persistently disabled it.
- `start` resumes the retained machine.
- `checkpoint` captures the three backup-covered filesystem volumes, not
  memory or Docker daemon state.
- `restore` always creates a new machine and host identity.
- Replace an owner key by adding and verifying the new public key before
  removing the old one.
- Suspected compromise requires stop, checkpoint, credential revocation, and
  isolated restore; do not restart the source for investigation.

Do not run lifecycle or Dokploy operations from inside the guest. Use the
operator CLI from an authenticated `infra-nixos-server` checkout. Mutating CLI
commands preview by default and require `--apply`; never substitute raw Docker
or Dokploy deletion, recreation, or pruning commands.

## Safety boundaries

- Treat the machine's home, workspaces, credentials, Docker state, and volumes
  as persistent user data even when excluded from checkpoints.
- Do not run destructive Git commands, `docker system prune`, remove
  containers or volumes, or delete workspaces without explicit authorization
  and exact-target validation.
- Do not manage the underlying Dokploy application, host firewall, DNS, image,
  backups, or lifecycle from inside the guest.
- Verify command exit status and re-check affected Git, process, or Docker
  state after mutations.
- Avoid printing environment variables, auth files, tokens, private keys, or
  credential-bearing command output.
