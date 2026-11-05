---
name: hop-studies-staging-refresh
description: Refresh HOP Studies staging from existing production database dumps and snapshot files using the guarded infrastructure command. Use for replacing staging data and diagnosing a failed refresh, not production restores or continuous replication.
---

# HOP Studies Staging Refresh

Use the maintained command in the HOP `infra-nixos-server` repository. On Simon's Mac,
the normal checkout is `/Users/simon/hoptech/projects/mob/infra-nixos-server`.
Locate the checkout in the current workspace on another machine; use the remote-hosts
skill's private host map when necessary. Read its instructions and
`docs/runbooks/studies-staging-refresh.md` before operating.

## Run the refresh

From that checkout:

```sh
node scripts/dokploy/refresh-studies-staging.mjs plan
node scripts/dokploy/refresh-studies-staging.mjs refresh --apply
```

For an explanation or inspection, run only `plan`. If the user requests an actual
production-to-staging refresh, proceed with `--apply` under that authorization; do not
ask again for the same replacement. The settled workflow uses the latest existing
production dumps, discards staging without a staging backup, permits staging downtime,
preserves accounts/passwords/roles and copies snapshot-referenced files. It is a one-time
refresh, not a synchronization service or schedule.

The command selects both production backups, pins generations, prepares candidate staging
databases, applies staging migrations and checks files before downtime. It handles cloud
files and local-only questionnaire audio, removes active credentials/jobs, replaces staging
files/databases, rotates staging secrets and runs real login/data/file verification.
Keep the CLI's output private to the task; never expose runtime env or credential contents.

The infrastructure `.env` supplies Dokploy/SSH access. Cloud commands use
`gswitch run hop` as `simon@hoptech.ca`; do not change the global cloud account.
The staging bucket/account must already be isolated from production. If preflight fails,
investigate the actual cause rather than disabling a guard, copying production credentials
into staging, skipping files or running a production backup worker's default restore.

## Recover or adapt

Follow the runbook's failure section and the specific run's `state.json`. A failure after
replacement starts keeps staging offline. Correct the cause and rerun a full refresh.
If a disconnected worker still owns a lock, establish that it has stopped before any
manual recovery. Never steal an active lock or restart a partially replaced staging app.

Unknown file/storage schema, missing source objects, incompatible engine versions or a
failed migration require investigation. Update the maintained tool and its tests when the
model changes; do not assemble an unguarded destructive shell sequence to bypass it.
Keep production read-only throughout the refresh.

Report source dump times, completion/failure, staging availability, file verification and
any unexercised paths. Users must sign in again and reissue participant codes/API keys.
Interactive Google/Apple sign-in is a manual check; the command verifies callback routing
and preserves provider links but does not claim an interactive provider login.
