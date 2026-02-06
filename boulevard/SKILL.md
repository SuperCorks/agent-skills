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

## Schema Reference

Full GraphQL schemas are available in `schemas/` for both APIs. **Always consult these schemas before constructing queries** to use correct field names, types, and relationships.

| File | Description |
|------|-------------|
| `schemas/admin-schema.graphql` | Admin API SDL (types, queries, mutations) |
| `schemas/client-schema.graphql` | Client API SDL (booking flow types, cart mutations) |

### How to use

- Before writing a query, grep the relevant schema file for the type or field you need
- Check input types (e.g. `CreateOfferInput`, `UpdateServiceInput`) for writable fields
- Check union/interface types for inline fragment syntax (e.g. `... on OfferFixedDiscount`)
- The schemas include full field descriptions from Boulevard's API docs

### Refreshing schemas

Re-run the download script when Boulevard updates their API:

```bash
node .github/skills/boulevard/scripts/download-schemas.js \
  --env=prod \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET
```

This runs introspection queries against both Admin and Client APIs and writes the SDL files.

## Scripts

### Download Schemas

Download/refresh the Admin and Client API GraphQL schemas via introspection:

```bash
node .github/skills/boulevard/scripts/download-schemas.js \
  --env=prod \
  --business-id=YOUR_BUSINESS_ID \
  --api-key=YOUR_API_KEY \
  --api-secret=YOUR_API_SECRET
```

Outputs SDL files to `schemas/admin-schema.graphql` and `schemas/client-schema.graphql`.

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

### Sync Packages (Create-Only)

Replicate missing package categories and packages from source to target:

```bash
node .github/skills/boulevard/scripts/sync-packages.js \
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

**Filter by name pattern:**
```bash
# Sync only packages matching a regex
node .github/skills/boulevard/scripts/sync-packages.js \
  ... \
  --filter="8x-LHR|Unlimited-LHR"
```

**Sync inactive packages:**
```bash
# Sync inactive packages (e.g., newly created but not yet live)
node .github/skills/boulevard/scripts/sync-packages.js \
  ... \
  --inactive \
  --filter="8x-LHR"
```

Behavior:
- **Create-only**: Creates missing package categories and packages; never deletes
- **Voucher mapping**: Maps voucher service references to target by service name
- **Full data sync**: Includes price, description, taxable, commissionEnabled, vouchers

## ID Format Quirks

Boulevard uses URN-style IDs like `urn:blvd:Service:abc123-def456`. However, the API is inconsistent about which format it accepts:

| Mutation | `id` parameter | Reference IDs (e.g., `categoryId`, `serviceId`) |
|----------|----------------|------------------------------------------------|
| `updateServiceCategory` | Full URN ✅ | N/A |
| `updateService` | Full URN ✅ | **UUID only** ⚠️ |
| `createService` | N/A | Full URN ✅ |
| `createPackage` | N/A | Full URN ✅ (both `categoryId` and `serviceId`) |
| `updatePackage` | Full URN ✅ | Likely Full URN (untested) |

**Example**: Moving a service to a different category requires UUID-only for `categoryId`:
```bash
# ❌ Fails with "category_id: is invalid"
--variables='{"input": {"id": "urn:blvd:Service:...", "categoryId": "urn:blvd:ServiceCategory:abc123"}}'

# ✅ Works
--variables='{"input": {"id": "urn:blvd:Service:...", "categoryId": "abc123"}}'
```

## Updating Services & Categories

### Rename a Category
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='mutation RenameCategory($input: UpdateServiceCategoryInput!) {
    updateServiceCategory(input: $input) { serviceCategory { id name } }
  }' \
  --variables='{"input": {"id": "urn:blvd:ServiceCategory:abc123", "name": "New Name"}}'
```

### Rename a Service
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='mutation UpdateService($input: UpdateServiceInput!) {
    updateService(input: $input) { service { id name } }
  }' \
  --variables='{"input": {"id": "urn:blvd:Service:abc123", "name": "New Service Name"}}'
```

### Move a Service to a Different Category
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='mutation UpdateService($input: UpdateServiceInput!) {
    updateService(input: $input) { service { id name category { name } } }
  }' \
  --variables='{"input": {"id": "urn:blvd:Service:abc123", "categoryId": "def456"}}'
```
Note: `categoryId` must be UUID-only (not full URN).

## Writable Fields (API Limitations)

Per Boulevard Admin API schema, only these fields can be set:

**ServiceCategory** (create/update):
- `name`

**Service** (create/update):
- `name`, `description`, `categoryId`, `addon`, `externalId`

Note: `defaultDuration` and `defaultPrice` are **read-only** in the API. They cannot be synced programmatically.

**PackageCategory** (create/update):
- `name`

**Package** (create/update):
- `name`, `description`, `unitPrice`, `taxable`, `commissionEnabled`, `active`, `categoryId`, `externalId`, `accountCreditAmount`
- `productVouchers` - array of vouchers with `quantity` and `productVoucherServices[].serviceId`

Note: Packages support full price sync unlike services.

## Examples

### Get all locations
```bash
node .github/skills/boulevard/scripts/query-admin.js \
  --env=sandbox --business-id=X --api-key=Y --api-secret=Z \
  --query='{ locations(first: 100) { edges { node { id externalId name isRemote address { line1 city state zip } } } } }'
```

### Compare locations between environments
Query both environments and compare by name/address. Locations don't have a dedicated diff script, but you can query each and compare manually.

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
