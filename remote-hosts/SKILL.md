---
name: remote-hosts
description: Connect to and operate Simon's remote agentic coding workspaces over SSH. Use when a local agent needs to inspect a remote host, run commands, clone or update a Git repository, work with remote Codex/Claude/OpenCode, use nested Docker, request a Codex phone pairing code, or troubleshoot a remote development environment such as sim.agents.hoptech.ca.
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
- Persistent storage:
  - `/home/agent` for credentials, CLI state, and user configuration.
  - `/workspaces` for Git repositories and engineering work.
  - `/var/lib/agent-machine` for machine identity and SSH host-key state.
- Existing project: `/workspaces/champs`, cloned from
  `https://github.com/SuperCorks/Champs.git`.
- Tools include Codex, Claude Code, OpenCode, GitHub CLI, Node/fnm, Python/uv,
  Go, Rust, Google Cloud CLI, `gws`, `gswitch`, `curl`, and Docker CLI.
- Docker uses a persistent TLS-connected Docker-in-Docker sidecar. Use `docker`
  directly as `agent`, not through `sudo`.
- Codex, Claude Code, and OpenCode have a guarded daily updater. It skips all
  updates while any coding-agent session is active or its status is uncertain.

## Connect and inspect

Confirm the effective SSH configuration and then test non-interactive access:

```bash
ssh -G sim.agents.hoptech.ca
ssh -o BatchMode=yes sim.agents.hoptech.ca true
```

Run commands through the login shell so owner-installed tools are on `PATH`:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'cd /workspaces/champs && git status --short --branch'"
```

Use `ssh -t sim.agents.hoptech.ca` only for a command that needs a terminal.
Keep complex scripts local or transfer an reviewed script explicitly rather
than constructing fragile nested shell quoting.

If SSH fails, report the resolved host, user, port, and error. Do not disable
strict host-key checking, remove known-host entries, rotate keys, or expose a
new port unless the user explicitly requests the corresponding infrastructure
change.

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
ssh sim.agents.hoptech.ca "bash -lc 'docker info'"
```

For interactive work, SSH into the host, change to the repository, and launch
the desired CLI. For Codex Desktop, use **Settings > Connections**, enable the
concrete SSH host `sim.agents.hoptech.ca`, and choose the remote project folder.
The desktop app starts its remote app server through SSH.

For Codex phone access:

```bash
ssh sim.agents.hoptech.ca "bash -lc 'codex remote-control start'"
ssh sim.agents.hoptech.ca "bash -lc 'codex remote-control pair --json'"
```

Return only `manualPairingCode` and the human-readable `expiresAt` time to the
user. Treat pairing codes as short-lived credentials. Never expose the Codex
app-server socket or transport on a public network.

## Safety boundaries

- Treat the machine's home, workspaces, credentials, Docker state, and volumes
  as persistent user data.
- Do not run destructive Git commands, `docker system prune`, remove
  containers or volumes, or delete workspaces without explicit authorization
  and exact-target validation.
- Do not manage the underlying Dokploy application, host firewall, DNS, image,
  backups, or lifecycle from inside the guest. Use the
  `infra-nixos-server` deployment tooling and runbooks for those tasks.
- Verify command exit status and re-check affected Git, process, or Docker
  state after mutations.
- Avoid printing environment variables, auth files, tokens, private keys, or
  credential-bearing command output.
