# Boulevard Booking Workflows

Use this reference when the task is about live availability, booking, or cancellation.

## Env-File Workflow

In this repo, most Boulevard work should start from:

```bash
--env-file=.env.local
```

That supplies:

- `NEXT_PUBLIC_BLVD_ENV`
- `BLVD_BUSINESS_ID`
- `BLVD_API_KEY`
- `BLVD_API_SECRET`

Prefer CLI flags when you need to override those values for a one-off run.

## Booking Flow

The reliable guest-client booking sequence is:

1. `createCart(locationId)`
2. inspect `availableCategories -> availableItems`
3. `addCartSelectedBookableItem(id, itemId)`
4. `cartBookableDates(id, searchRangeLower, searchRangeUpper, tz)`
5. `cartBookableTimes(id, searchDate, tz)`
6. `reserveCartBookableItems(id, bookableTimeId)`
7. `updateCart(id, clientInformation)`
8. `checkoutCart(id)`

If you need appointment details after checkout, query the Admin API with the returned `appointmentId`.

## Why Booking Can Be Slow

Bulk booking often looks slow because the real work is:

- discover each location's enabled bookable items
- create a fresh cart per item
- resolve dates
- resolve times
- then try to reserve and checkout each candidate slot

For long runs, prefer:

- `--location`
- `--service`
- `--limit`
- `--zero-dollar-only`

## Common Failure Mode

The most common booking failure is:

`Time is no longer available, please select another.`

That usually means:

- another earlier attempt already consumed the shared underlying slot
- different services surfaced the same real staff/resource opening
- the slot changed between discovery and reservation

This is expected during broad bulk booking. Treat it as a normal failed attempt, not a script bug.

## Discovery Tips

### List Bookable Items For A Location

```bash
node .github/skills/boulevard/scripts/list-bookable-items.js \
  --env-file=.env.local \
  --location=Edina
```

### Show Only Free Consults

```bash
node .github/skills/boulevard/scripts/list-bookable-items.js \
  --env-file=.env.local \
  --location=Edina \
  --zero-dollar-only
```

### Discover Times For One Service

```bash
node .github/skills/boulevard/scripts/discover-availability.js \
  --env-file=.env.local \
  --location=Edina \
  --service="In-Person Consultation" \
  --service-exact \
  --date=2026-03-20
```

## Booking Safety

`book-slots.js` defaults to dry-run.

Recommended sequence:

1. run without `--confirm`
2. inspect the JSON artifact written to `/tmp`
3. rerun with `--confirm`
4. if the run created test appointments, clean them up with `cancel-appointments.js`

Use service filters whenever the user does not explicitly want "everything."

## Cancellation Workflow

Cancellation uses the Admin API:

1. resolve one location
2. list appointments for the local date window
3. optionally filter by service name
4. optionally filter by client email prefix
5. `cancelAppointment(id, reason, notes, notifyClient)`

`cancel-appointments.js` also defaults to dry-run.

For sandbox cleanup, prefer filtering by `--client-email-prefix` so you only cancel appointments created by your own run.

## Suggested Reasons

Safe defaults:

- `MISTAKE` for sandbox cleanup
- `STAFF_CANCEL` when explicitly simulating business-side cancellation

Avoid `notifyClient` unless the task explicitly calls for it.
