---
name: vidapp
description: 'Query VidApp analytics, purchases, watch history, user tags, collections, and OpenAPI docs using the VIDAPP_API_KEY env var. Use for mobile subscriber, app-store billing, and mobile engagement investigation.'
---

# VidApp

Query VidApp's REST API for app analytics, app-store purchase records, watch history, app content collections, and user tags.

VidApp is the mobile and connected-TV application layer that sits alongside the Vimeo OTT stack for YogaWorks. In practice, it is one of the best available sources for:

- mobile and app-store subscription state
- app-store billing fields that do not flow cleanly through Vimeo webhooks
- mobile watch history and engagement data
- app-side user tags and CRM-like state

This first pass is intentionally read-only. The VidApp API supports writes for users, products, watch history, watchlist, playlists, user tags, and webhooks, but the included scripts only perform `GET` requests so they are safe for production investigation.

## Overview

- Base URL: `https://api.vidapp.com`
- Auth: `x-api-key` header
- Docs: `https://api.vidapp.com/docs`
- OpenAPI spec: `https://api.vidapp.com/openapi.json`

Major resource groups from the official docs:

- `analytics` for videos, live events, and purchases
- `content` for app collections and collection items
- `watch-history` for per-user watch activity
- `user-tags` and `user-tags/history` for app-side user state
- `users`, `user_products`, `watchlist`, `playlists`, and `webhooks` for broader CRM / app operations

## Setup

### Prerequisites

- Node.js 20+
- No external npm dependencies are required

### Environment Variables

Required:

```bash
export VIDAPP_API_KEY='YOUR_API_KEY'
```

Optional but convenient for app-scoped endpoints:

```bash
export VIDAPP_APP_ID='Yogaworks'
```

If `VIDAPP_APP_ID` is not set, pass `--app-id <value>` to app-scoped scripts.

YogaWorks examples:

```bash
export VIDAPP_API_KEY='YOUR_API_KEY'
export VIDAPP_APP_ID='Yogaworks'
```

## Included Scripts

### Access verification

Smoke test the API key and summarize the spec surface:

```bash
node scripts/verify-access.js
node scripts/verify-access.js --app-id Yogaworks
```

This checks `GET /health`, loads the OpenAPI spec, and optionally performs a tiny purchases probe for the specified app id.

### Generic read-only GETs

Use this when the endpoint exists in the docs but there is no dedicated helper yet:

```bash
node scripts/get-resource.js --path /health
node scripts/get-resource.js --path /openapi.json
node scripts/get-resource.js --path /analytics/Yogaworks/purchases --query-json '{"page_size":5,"status":"Active"}'
```

### Analytics

Read videos, live-events, or purchases:

```bash
node scripts/read-analytics.js --type videos --app-id Yogaworks --start-date 2026-03-13 --end-date 2026-04-11

node scripts/read-analytics.js --type live-events --app-id Yogaworks --start-date 2026-03-13 --end-date 2026-04-11

node scripts/read-analytics.js --type purchases --app-id Yogaworks --page-size 5

node scripts/read-analytics.js --type purchases --app-id Yogaworks --status Active --page-size 5

node scripts/read-analytics.js --type purchases --app-id Yogaworks --status Trial --platform Apple --page-size 5
```

Notes:

- The analytics endpoints for `videos` and `live-events` enforce a date window under 31 days.
- `purchases` supports useful filters such as `status`, `platform`, `store_product_id`, and email `query`.
- Purchase records can contain sensitive fields like purchaser email and store token. Handle raw output carefully.

### Watch history

Fetch per-user watch history by VidApp `source_user_id`:

```bash
node scripts/read-watch-history.js --source-user-id USER123
node scripts/read-watch-history.js --source-user-id USER123 --page 2 --per-page 200
```

This is a strong candidate source when the warehouse is missing mobile engagement history.

### User tags

Read current user tags or tag history:

```bash
node scripts/read-user-tags.js --user-id USER123
node scripts/read-user-tags.js --user-id USER123 --history --limit 100
node scripts/read-user-tags.js --user-id USER123 --history --tag onboarding_state --from-date 2026-01-01 --to-date 2026-04-11
```

### App content collections

Read a collection and its child items:

```bash
node scripts/read-collection.js --app-id Yogaworks --collection-id 12345
```

## Official Documentation

- VidApp docs: `https://api.vidapp.com/docs`
- VidApp OpenAPI spec: `https://api.vidapp.com/openapi.json`

## Production-Safe Guidance

- Prefer the included scripts or documented `GET` endpoints unless you intentionally want a write.
- Avoid write endpoints casually against production. The API includes mutation paths for users, user products, watch history, watchlist, playlists, user tags, and webhook subscriptions.
- Treat purchase responses as sensitive because they can include purchaser email and store token values.
- If you are trying to close YogaWorks data gaps, prioritize purchases first, then webhooks, then watch history.

## Common Quirks

- App-scoped endpoints require the VidApp app id, which is `Yogaworks` for YogaWorks.
- `videos` and `live-events` reject date ranges longer than 30 days.
- Pagination fields vary by endpoint. Purchases return `Page`, `TotalItems`, and `TotalPages`.
- Watch-history uses `source_user_id`, not necessarily a Vimeo numeric id, so identity mapping should be verified before ingestion.

## Suggested Workflow

For YogaWorks mobile subscriber or engagement investigation, this sequence is usually efficient:

1. `node scripts/verify-access.js --app-id Yogaworks`
2. `node scripts/read-analytics.js --type purchases --app-id Yogaworks --page-size 5`
3. `node scripts/read-analytics.js --type purchases --app-id Yogaworks --status Active --page-size 5`
4. `node scripts/read-analytics.js --type videos --app-id Yogaworks --start-date 2026-03-13 --end-date 2026-04-11`
5. `node scripts/read-watch-history.js --source-user-id <source_user_id>`
6. `node scripts/read-user-tags.js --user-id <source_user_id> --history --limit 100`