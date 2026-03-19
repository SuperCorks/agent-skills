---
name: boulevard
description: 'Query Boulevard Admin, Public Client, and Known Client APIs; discover availability; book or cancel sandbox appointments; and compare or sync services/packages between prod and sandbox.'
---

# Boulevard API Skill

Use this skill for Boulevard investigations and operations, especially when the task involves:

- querying Admin, Public Client, or Known Client GraphQL APIs
- discovering live availability for a date, location, or service
- bulk booking or cancelling sandbox appointments
- comparing or syncing services or packages between environments

## Quick Start

All scripts are standalone Node.js 20+ files under `.github/skills/boulevard/scripts/`.

Single-environment scripts can load repo credentials from an env file:

```bash
--env-file=.env.local
```

Supported defaults:

- `NEXT_PUBLIC_BLVD_ENV`
- `BLVD_BUSINESS_ID`
- `BLVD_API_KEY`
- `BLVD_API_SECRET`

Use CLI flags to override env-file values.

## Choose The Right Tool

Use these first when the task matches:

- `scripts/list-bookable-items.js`
  Best for: "what can this location book online right now?"
- `scripts/discover-availability.js`
  Best for: "what times are available on this date?"
- `scripts/book-slots.js`
  Best for: booking sandbox slots after a dry-run preflight
- `scripts/cancel-appointments.js`
  Best for: cleaning up sandbox appointments created by automation
- `scripts/query-admin.js`, `query-client-public.js`, `query-client-known.js`
  Best for: one-off GraphQL inspection when no task-oriented script fits

For the exact booking/cancellation workflow and safety notes, read:

- `references/booking-workflows.md`

## Task-Oriented Scripts

### List Bookable Items

```bash
node .github/skills/boulevard/scripts/list-bookable-items.js \
  --env-file=.env.local \
  --location=Edina
```

Useful flags:

- `--location-exact`
- `--service`
- `--service-exact`
- `--zero-dollar-only`

### Discover Availability

```bash
node .github/skills/boulevard/scripts/discover-availability.js \
  --env-file=.env.local \
  --location=Edina \
  --date=2026-03-20
```

Behavior:

- groups results by service in the summary
- writes a JSON artifact to `/tmp` by default
- prints progress to stderr for long scans

### Book Slots

```bash
# preflight only
node .github/skills/boulevard/scripts/book-slots.js \
  --env-file=.env.local \
  --location=Edina \
  --date=2026-03-20

# real execution
node .github/skills/boulevard/scripts/book-slots.js \
  --env-file=.env.local \
  --location=Edina \
  --date=2026-03-20 \
  --confirm
```

Guardrails:

- defaults to dry-run
- requires `--location` and `--date`
- writes structured JSON with booked and failed attempts
- supports `--limit`, `--service`, and `--zero-dollar-only`

### Cancel Appointments

```bash
# dry-run
node .github/skills/boulevard/scripts/cancel-appointments.js \
  --env-file=.env.local \
  --location=Edina \
  --date=2026-03-20 \
  --client-email-prefix=codex-blvd

# real cancellation
node .github/skills/boulevard/scripts/cancel-appointments.js \
  --env-file=.env.local \
  --location=Edina \
  --date=2026-03-20 \
  --client-email-prefix=codex-blvd \
  --confirm
```

Use `--client-email-prefix` whenever possible to avoid cancelling unrelated appointments.

## Raw Query Scripts

Use the raw query scripts when a task-oriented script does not fit:

- `query-admin.js`
- `query-client-public.js`
- `query-client-known.js`

Before writing a raw query:

- grep `schemas/admin-schema.graphql` or `schemas/client-schema.graphql`
- confirm input field names and required IDs
- check unions/interfaces before using inline fragments

## Existing Admin / Sync Utilities

These remain useful for setup and environment comparison:

- `download-schemas.js`
- `find-client.js`
- `list-service-categories.js`
- `list-services.js`
- `diff-services.js`
- `sync-services.js`
- `sync-packages.js`

## Notes

- Boulevard rate limits are real; prefer narrow filters and use task-oriented scripts before bulk raw queries.
- For destructive actions, always inspect the dry-run JSON artifact before re-running with `--confirm`.
