````skill
---
name: boulevard
description: 'Query Boulevard Admin, Public Client, and Known Client APIs. Compare and sync services between Boulevard instances (prod/sandbox).'
---

# Boulevard API Skill

Query and manage Boulevard booking system data via Admin API, Public Client API, and Known Client API.

## Overview

Boulevard exposes three GraphQL APIs:
- **Admin API** - Manage business operations (services, categories, clients, appointments, etc.)
- **Public Client API** - Guest/anonymous booking flows
- **Known Client API** - Authenticated client booking with access to client-specific data

## Setup

All scripts are standalone JavaScript (Node.js 20+) using built-in `fetch`. No npm install required.

### Required Credentials

Obtain from Boulevard Dashboard → Settings → Developer → API Applications:
- **API Key** (`--api-key`) - Public identifier for your app
- **API Secret** (`--api-secret`) - Used to sign tokens (keep secure!)
- **Business ID** (`--business-id`) - Your Boulevard business UUID

### Environment Selection

Use `--env=sandbox` or `--env=prod` to target:
- Sandbox: `https://sandbox.joinblvd.com/api/2020-01/...`
- Production: `https://dashboard.boulevard.io/api/2020-01/...`

## Security Note

⚠️ Pass credentials via CLI flags (not environment variables) for isolation. Avoid logging secrets. The API secret should never be committed or shared.

## Rate Limits

Boulevard uses query-cost-based rate limiting:
- **Bucket**: 10,000 cost points
- **Leak rate**: 50 points/second
- **Connection limit**: 1,000 edges per query
- **Depth limit**: 10 levels

Scripts automatically retry on rate limit errors by parsing the wait time from error messages.

## Scripts

### Query Admin API

Execute arbitrary GraphQL against the Admin API:

```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET \
  --query='{ locations(first: 10) { edges { node { id name } } } }'
```

With variables:
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET \
  --query='query GetClient($id: ID!) { client(id: $id) { id firstName lastName email } }' \
  --variables='{"id": "urn:blvd:Client:abc123"}'
```

### Query Public Client API

Execute GraphQL as an anonymous/guest user:

```bash
node .github/skills/boulevard/scripts/query-client-public.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --query='{ business { id name locations(first: 5) { edges { node { id name } } } } }'
```

### Query Known Client API

Execute GraphQL on behalf of a specific client (requires client ID):

```bash
node .github/skills/boulevard/scripts/query-client-known.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET \
  --client-id=abc123-def456 \
  --query='{ client { id firstName memberships { edges { node { id name } } } } }'
```

### Find Client by Email

Look up a client ID using their email (via Admin API):

```bash
node .github/skills/boulevard/scripts/find-client.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET \
  --email=client@example.com
```

### List Service Categories

Fetch all service categories with pagination:

```bash
node .github/skills/boulevard/scripts/list-service-categories.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET
```

### List Services

Fetch all services with category info and pagination:

```bash
node .github/skills/boulevard/scripts/list-services.js \
  --env=sandbox \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET
```

### Diff Services Between Environments

Compare services between prod and sandbox:

```bash
node .github/skills/boulevard/scripts/diff-services.js \
  --source-env=prod \
  --source-business-id=PROD_BUSINESS_ID \
  --source-api-key=PROD_API_KEY \
  --source-api-secret=PROD_API_SECRET \
  --target-env=sandbox \
  --target-business-id=SANDBOX_BUSINESS_ID \
  --target-api-key=SANDBOX_API_KEY \
  --target-api-secret=SANDBOX_API_SECRET
```

Output includes:
- Categories in source but not target
- Services in source but not target
- Services with mismatched `externalId`

### Sync Services (Create-Only)

Replicate missing categories and services from source to target:

```bash
node .github/skills/boulevard/scripts/sync-services.js \
  --source-env=prod \
  --source-business-id=PROD_BUSINESS_ID \
  --source-api-key=PROD_API_KEY \
  --source-api-secret=PROD_API_SECRET \
  --target-env=sandbox \
  --target-business-id=SANDBOX_BUSINESS_ID \
  --target-api-key=SANDBOX_API_KEY \
  --target-api-secret=SANDBOX_API_SECRET \
  --dry-run
```

Behavior:
- **Create-only**: Creates missing categories and services; never deletes
- **externalId backfill**: If source has `externalId` but matching target service doesn't, updates target
- **Matching**: Uses `externalId` if present, otherwise `name + categoryName`

Add `--dry-run` to preview changes without making mutations.

## Writable Fields (API Limitations)

Per Boulevard Admin API schema, only these fields can be set:

**ServiceCategory** (create only):
- `name`

**Service** (create/update):
- `name`, `description`, `categoryId`, `addon`, `externalId`

Note: `defaultDuration` and `defaultPrice` are **read-only** in the API. They cannot be synced programmatically.

## Examples

### Get all locations
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='{ locations(first: 100) { edges { node { id name address { line1 city state } } } } }'
```

### Get appointments for a date range
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=prod --business-id=X --api-key=Y --api-secret=Z \
  --query='query GetAppointments($locationId: ID!, $start: DateTime!, $end: DateTime!) {
    appointments(first: 100, query: "locationId == \"$locationId\" AND startAt >= \"$start\" AND startAt < \"$end\"") {
      edges { node { id startAt state client { firstName lastName } } }
    }
  }' \
  --variables='{"locationId": "...", "start": "2026-02-01T00:00:00Z", "end": "2026-02-28T00:00:00Z"}'
```

### Create a service
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='mutation CreateService($input: CreateServiceInput!) {
    createService(input: $input) { service { id name } }
  }' \
  --variables='{"input": {"name": "New Service", "categoryId": "urn:blvd:ServiceCategory:abc123", "description": "Service description"}}'
```

## Official Documentation

- [Admin API Overview](https://developers.joinblvd.com/2020-01/admin-api/overview)
- [Admin API Authentication](https://developers.joinblvd.com/2020-01/admin-api/authentication)
- [Client API Overview](https://developers.joinblvd.com/2020-01/client-api/overview)
- [Client API Authentication](https://developers.joinblvd.com/2020-01/client-api/authentication)
- [Rate Limiting](https://developers.joinblvd.com/2020-01/admin-api/rate-limiting)

````
