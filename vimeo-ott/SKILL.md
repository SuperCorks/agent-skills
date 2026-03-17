---
name: vimeo-ott
description: 'Query Vimeo OTT (VHX) products, customers, videos, live events, browse rows, and analytics with multi-account API key support. First pass ships read-only helpers for production-safe investigation.'
---

# Vimeo OTT

Query Vimeo OTT's REST API for analytics, customer profiles, products, videos, collections, browse data, and live events.

This first pass is intentionally read-only. The API itself supports writes for customers, videos, collections, comments, and authorizations, but the included scripts only perform `GET` requests so they are safe to use against production accounts for investigation and reporting.

## Overview

Vimeo OTT uses the legacy VHX API surface:

- Base URL: `https://api.vhx.tv`
- Auth: HTTP Basic Auth with the API key as the username and a blank password
- Response format: JSON with HAL-style `_links` and `_embedded`

The most important resource groups are:

- `products` for subscription or transactional packages
- `customers` for customer profiles, subscription status, watchlist, and in-progress watching
- `videos` for catalog assets, files, metadata, plays, and finishes
- `live_events` for scheduled and active Vimeo Events tied to products
- `collections` and `browse` for storefront organization
- `analytics` for traffic, subscribers, churn, units, and video reporting

## Setup

### Prerequisites

- Node.js 20+
- No external npm dependencies are required

### Environment Variables

Use a JSON object mapping account aliases to API keys:

```bash
export VIMEO_OTT_ACCOUNTS='{"yogaworks":"YOUR_API_KEY"}'
```

When multiple accounts are configured, pass `--account <name>` to choose one. If only one account is configured, it is selected automatically.

### Generating an API Key

Official Vimeo OTT guidance:

1. Open the Vimeo OTT Admin Dashboard.
2. Go to `Manage > Platforms`.
3. Scroll to the bottom and click `Create Key`.
4. Name the application and copy the private key immediately.

Important behavior from the official help docs:

- API keys are tied to the site owner.
- Changing the site owner disables existing keys.
- Vimeo OTT does not store the private key for later retrieval.
- Deleting a key requires contacting support.

## Included Scripts

### Account management

List configured aliases:

```bash
node scripts/list-accounts.js
```

Verify API access and summarize the account:

```bash
node scripts/verify-access.js --account yogaworks
```

The verification script does a small read-only smoke test against `products`, `customers`, `videos`, `collections`, and `analytics`.

### Products

List products:

```bash
node scripts/list-products.js --account yogaworks
node scripts/list-products.js --active true --sort alphabetical --account yogaworks
```

Read any product sub-resource with the generic reader:

```bash
node scripts/get-resource.js --path /products/156019/prices --account yogaworks
```

### Customers

List customers:

```bash
node scripts/list-customers.js --status all --per-page 25 --account yogaworks
node scripts/list-customers.js --email user@example.com --status all --account yogaworks
node scripts/list-customers.js --query smith --status all --account yogaworks
```

Read a customer profile:

```bash
node scripts/read-customer.js --id 55289178 --account yogaworks
```

Include watchlist and in-progress watching:

```bash
node scripts/read-customer.js \
  --id 55289178 \
  --include-watchlist \
  --include-watching \
  --account yogaworks
```

Notes:

- `GET /customers` defaults to `status=enabled` unless you set `status` explicitly.
- `GET /customers/:id/watching` should include the `VHX-Customer` header. The script handles that automatically when `--include-watching` is used.
- You can optionally scope customer lookups to a product using `--product <id|href>`.

### Videos

List videos:

```bash
node scripts/list-videos.js --sort newest --per-page 25 --account yogaworks
node scripts/list-videos.js --query vinyasa --plan standard --account yogaworks
```

Read a video:

```bash
node scripts/read-video.js --id 3595351 --account yogaworks
```

Include file renditions:

```bash
node scripts/read-video.js --id 3595351 --include-files --account yogaworks
node scripts/read-video.js --id 3595351 --include-files --quality adaptive --format m3u8 --account yogaworks
```

Notes:

- Video metadata is often enriched automatically from collection relationships.
- Live-event-backed videos expose `live_video`, `live_event_id`, and `scheduled_at`.
- File URLs are short-lived and intended to be fetched just before playback.

### Live events

List live events for a product:

```bash
node scripts/list-live-events.js --product 156019 --sort latest --account yogaworks
```

You can inspect a specific live event using the generic reader:

```bash
node scripts/get-resource.js --path /live_events/12345 --account yogaworks
```

### Analytics

Read an aggregate traffic report:

```bash
node scripts/read-analytics.js \
  --type traffic \
  --from 1-month-ago \
  --to today \
  --account yogaworks
```

Read subscriber trends:

```bash
node scripts/read-analytics.js \
  --type subscribers \
  --from 3-months-ago \
  --to today \
  --by month \
  --account yogaworks
```

Read video-specific analytics:

```bash
node scripts/read-analytics.js \
  --type video.platforms \
  --video-id 3595351 \
  --from 1-month-ago \
  --to today \
  --account yogaworks
```

Supported analytics types from the official docs:

- `traffic`
- `income_statement`
- `units`
- `subscribers`
- `churn`
- `video`
- `video.platforms`
- `video.geography`
- `video.subtitles`

Notes:

- Supplying `--by` converts the report into a time-series variant.
- Video report types require `--video-id`.
- Accepted date formats include `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SSZ`, and relative ranges like `1-month-ago`.

### Generic read-only GETs

Use this when the endpoint exists in the official docs but there is no dedicated helper yet:

```bash
node scripts/get-resource.js --path /browse --query-json '{"product":"https://api.vhx.tv/products/156019"}' --account yogaworks

node scripts/get-resource.js --path /collections/123/items --query-json '{"include_events":1,"per_page":10}' --account yogaworks

node scripts/get-resource.js --path /comments --query-json '{"video":"https://api.vhx.tv/videos/3595351"}' --account yogaworks
```

The generic script also supports request headers for customer-scoped reads:

```bash
node scripts/get-resource.js \
  --path /customers/55289178/watching \
  --customer 55289178 \
  --account yogaworks
```

## Official Documentation

- Vimeo OTT API overview: `https://dev.vhx.tv/api/`
- Vimeo OTT API reference: `https://dev.vhx.tv/docs/api/`
- Vimeo OTT help: `https://help.vimeo.com/hc/en-us/articles/12427832342673-Does-Vimeo-OTT-have-an-API`
- API key generation: `https://help.vimeo.com/hc/en-us/articles/12427027758609-Generate-an-API-key-on-Vimeo-OTT`

## Resource Map

The reference docs cover these major read and write surfaces:

- `products`: list, retrieve, list prices
- `customers`: create, retrieve, list, update, add/remove product, watchlist, watching
- `videos`: create, retrieve, list, list files, update, delete
- `live_events`: list, retrieve
- `comments`: create, retrieve, list, report
- `collections`: create, retrieve, list, update, position updates, item listing and item management
- `browse`: list storefront rows for a product
- `authorizations`: create player authorization tokens for customer playback
- `analytics`: retrieve aggregate and time-series reports

## Production-Safe Guidance

- Prefer the included scripts or documented `GET` endpoints unless you intentionally want a write.
- Do not use write endpoints casually against production. There are destructive APIs for deleting videos, removing products from customers, removing watchlist items, and deleting collection items.
- Avoid generating playback authorizations unless you explicitly need them. They are non-destructive but they do mint access tokens.
- When investigating customer playback behavior, use `VHX-Customer` so the response is scoped to the right user.

## Common Quirks

- The API is still branded as VHX in URLs and docs even though the product is Vimeo OTT.
- Resource identity is usually best handled via `_links.self.href` rather than reconstructing URLs by hand.
- Paginated endpoints return `count`, `total`, `_links`, and `_embedded` arrays.
- `GET /browse` and `GET /live_events` require a product scope.
- `GET /customers/:id/watching` is customer-header-sensitive.

## Suggested workflow

For analytics and customer investigation, this sequence is usually efficient:

1. `node scripts/verify-access.js --account <alias>`
2. `node scripts/list-products.js --account <alias>`
3. `node scripts/list-customers.js --status all --query <term> --account <alias>`
4. `node scripts/read-customer.js --id <id> --include-watchlist --include-watching --account <alias>`
5. `node scripts/read-analytics.js --type subscribers --from 3-months-ago --to today --by month --account <alias>`
6. `node scripts/read-analytics.js --type video.platforms --video-id <video_id> --from 1-month-ago --to today --account <alias>`