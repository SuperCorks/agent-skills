---
name: godaddy
description: 'Manage GoDaddy domains and DNS records with multi-account API credentials. Use for listing domains, reading DNS records, checking for specific records, and safely creating new DNS entries.'
---

# GoDaddy DNS Manager

Use this skill for GoDaddy domain and DNS work, especially when the task involves:

- listing domains in a GoDaddy account
- reading DNS records for a domain
- checking whether a domain has a specific DNS record
- creating new DNS records with a confirmation guard

## Setup

### Prerequisites

- Node.js 20+

### Environment Variables

Use a JSON object mapping account aliases to credential objects:

```bash
export GODADDY_ACCOUNTS='{
  "prod": {
    "key": "YOUR_PROD_KEY",
    "secret": "YOUR_PROD_SECRET",
    "baseUrl": "https://api.godaddy.com"
  },
  "ote": {
    "key": "YOUR_OTE_KEY",
    "secret": "YOUR_OTE_SECRET",
    "baseUrl": "https://api.ote-godaddy.com"
  }
}'
```

Supported credential field names:

- `key` or `apiKey`
- `secret` or `apiSecret`
- optional `baseUrl`

When multiple accounts are configured, pass `--account <name>`. If only one account is configured, it is selected automatically.

If a non-interactive shell does not automatically load `~/.zshrc`, prefix commands with:

```bash
source ~/.zshrc &&
```

## Included Scripts

### Account Management

List configured aliases:

```bash
node scripts/list-accounts.js
```

Verify credentials with a read-only smoke test:

```bash
node scripts/verify-access.js --account prod
```

The verification script fetches a small domain sample and, when possible, reads records for the first domain.

### Domains

List domains:

```bash
node scripts/list-domains.js --account prod
node scripts/list-domains.js --status ACTIVE --limit 25 --account prod
node scripts/list-domains.js --includes nameServers,contacts --limit 10 --account prod
```

Useful flags:

- `--status <csv>` filters exact statuses
- `--status-group <csv>` filters status groups such as `VISIBLE`
- `--marker <domain>` paginates from a specific domain
- `--modified-date <ISO timestamp>` filters recently changed domains

### DNS Records

List all records for a domain:

```bash
node scripts/list-records.js --domain example.com --account prod
```

Filter to a specific type or name:

```bash
node scripts/list-records.js --domain example.com --type TXT --account prod
node scripts/list-records.js --domain example.com --type TXT --name _dmarc --account prod
```

Check whether a specific record exists:

```bash
node scripts/check-record.js --domain example.com --type TXT --name _dmarc --account prod
node scripts/check-record.js --domain example.com --type TXT --name _dmarc --data 'v=DMARC1; p=reject;' --account prod
```

Matching behavior:

- `--type` and `--name` are required
- if `--data` is omitted, the script checks whether any record with that type and name exists
- optional exact-match filters include `--data`, `--ttl`, `--priority`, `--service`, `--protocol`, `--weight`, and `--port`

### Create Records

Preview a DNS record creation request:

```bash
node scripts/create-record.js \
  --domain example.com \
  --type TXT \
  --name _acme-challenge \
  --data 'token-value' \
  --ttl 600 \
  --account prod
```

Execute the change:

```bash
node scripts/create-record.js \
  --domain example.com \
  --type TXT \
  --name _acme-challenge \
  --data 'token-value' \
  --ttl 600 \
  --account prod \
  --confirm
```

Behavior:

- defaults to preview mode unless `--confirm` is passed
- skips the write if an identical record already exists
- uses GoDaddy's `PATCH /v1/domains/{domain}/records` endpoint to add records without replacing the entire zone

Record-specific notes:

- `MX` requires `--priority`
- `SRV` requires `--service`, `--protocol`, `--port`, `--priority`, and `--weight`

### Replace A Record Set

Use this when a domain already has a record for the same type and name, and you want to replace that whole record set intentionally:

```bash
node scripts/replace-record-set.js \
  --domain example.com \
  --type TXT \
  --name _dmarc \
  --data 'v=DMARC1; p=none' \
  --ttl 3600 \
  --account prod
```

Execute the replacement:

```bash
node scripts/replace-record-set.js \
  --domain example.com \
  --type TXT \
  --name _dmarc \
  --data 'v=DMARC1; p=none' \
  --ttl 3600 \
  --account prod \
  --confirm
```

Behavior:

- defaults to preview mode unless `--confirm` is passed
- replaces all records for the exact `type + name` slot
- best for singleton records such as `_dmarc` TXT

## Common Options

Most scripts support:

- `--account <name>`
- `--base-url <url>`
- `--shopper-id <id>`
- `--help`

Use `--shopper-id` only when acting as a reseller on behalf of a shopper.

## Output Format

All scripts print JSON with:

- `metadata`
- task-specific payload such as `domains`, `records`, `verification`, or `preview`

## Error Codes

- `GODADDY_AUTH_MISSING`
- `GODADDY_AUTH_INVALID`
- `GODADDY_ACCOUNT_AMBIGUOUS`
- `GODADDY_ACCOUNT_NOT_FOUND`
- `GODADDY_ARGS_INVALID`
- `GODADDY_NOT_FOUND`
- `GODADDY_WRITE_CONFIRM_REQUIRED`
- `GODADDY_RATE_LIMITED`
- `GODADDY_API_ERROR`
