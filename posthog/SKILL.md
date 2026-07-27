---
name: posthog
description: Analyze product data and manage product tooling in PostHog with multi-account, multi-region, and multi-project support. Use for HogQL or Query API analysis, trends, funnels, retention, events, persons, feature flags, experiments, error tracking, session replay, surveys, LLM analytics, dashboards, data warehouse resources, or authenticated PostHog private API operations.
---

# PostHog

Use the bundled Node.js helpers to work with PostHog's private API using named account profiles. Each profile selects a personal API key, private API host, and optional default project so work does not silently cross accounts, regions, or projects.

Prefer current PostHog documentation over remembered API shapes. PostHog evolves quickly; verify unfamiliar request bodies and endpoints before issuing them.

## Required workflow

1. Clarify the goal, target account, project, date range, event/property names, and filters.
2. Resolve the account and project before querying. Use `list-accounts.js`, `list-projects.js`, or `verify-access.js` when the target is unclear.
3. Read first. Inspect existing resources and run a narrow query before widening the range or making changes.
4. For syntax or payload uncertainty, check the official documentation or live schema before calling the API.
5. Execute related reads in logical batches. Review a write preview before rerunning it with `--confirm`.
6. Summarize concrete results, selected account/project, date range, caveats, and useful PostHog UI links.

## Setup

Requirements:

- Node.js 20+
- No external npm dependencies

Configure named profiles with `POSTHOG_ACCOUNTS`:

```bash
export POSTHOG_ACCOUNTS='{
  "work-us": {
    "apiKey": "phx_your_personal_api_key",
    "host": "https://us.posthog.com",
    "projectId": "12345"
  },
  "client-eu": {
    "apiKey": "phx_another_personal_api_key",
    "host": "https://eu.posthog.com",
    "projectId": "67890"
  },
  "self-hosted": {
    "apiKey": "phx_self_hosted_personal_api_key",
    "host": "https://posthog.example.com"
  }
}'
```

Supported profile field aliases:

- API key: `apiKey`, `personalApiKey`, or `token`
- Private API host: `host`, `baseUrl`, or `appHost`
- Default project: `projectId`, `project`, or `environmentId`

The host must be the private app/API host. Use `https://us.posthog.com` or `https://eu.posthog.com`, not the public ingestion hosts containing `.i.posthog.com`.

For a single legacy profile, the helpers also accept:

```bash
export POSTHOG_PERSONAL_API_KEY='phx_your_personal_api_key'
export POSTHOG_HOST='https://us.posthog.com'
export POSTHOG_PROJECT_ID='12345'
```

Selection rules:

- `--account <alias>` takes priority.
- A sole configured profile is selected automatically.
- Multiple profiles require `--account`.
- `--project <id>` overrides the profile's `projectId`.
- `--host <url>` overrides the profile's host for that command.

Personal API keys can grant broad account access. Create least-privilege keys, keep them only in environment variables, and never print or commit them. Querying needs an appropriate query-read scope; mutations need the corresponding resource scopes.

## Account and project discovery

List configured aliases without exposing keys:

```bash
node scripts/list-accounts.js
```

List projects available to a profile:

```bash
node scripts/list-projects.js --account work-us
node scripts/list-projects.js --account work-us --limit 50 --offset 0
```

Verify the key, host, and selected project with a read-only request:

```bash
node scripts/verify-access.js --account work-us
node scripts/verify-access.js --account self-hosted --project 12345
```

## Query product data

Run HogQL through `POST /api/projects/:project_id/query/`:

```bash
node scripts/query.js \
  --account work-us \
  --name 'Daily signups for the last 14 days' \
  --hogql "SELECT toDate(timestamp) AS day, count() AS signups
           FROM events
           WHERE event = 'user_signed_up'
             AND timestamp >= now() - INTERVAL 14 DAY
           GROUP BY day
           ORDER BY day"
```

Run another Query API node from JSON:

```bash
node scripts/query.js \
  --account work-us \
  --name 'Signup trend' \
  --query-json '{"kind":"TrendsQuery","series":[{"kind":"EventsNode","event":"user_signed_up"}]}'
```

For larger nodes, use `--query-file <path>`. The file must contain the query node itself, not the outer `{ "query": ... }` request body.

Query guidance:

- Confirm event and property names with a small query before building a large analysis.
- Include a descriptive `--name`; PostHog records it in query logs.
- Respect the project's timezone when bucketing dates.
- Start with a short range and a row limit, validate the result, then widen.
- Do not use the Query API as a bulk export mechanism. Use batch exports for recurring or high-volume extraction.
- Avoid `OFFSET` for programmatic event pagination; use timestamp-based keyset pagination.
- With person-on-events, `person.properties.*` on an event reflects ingestion-time values, not necessarily the person's current properties.

## Read or manage other PostHog resources

Use `api-request.js` for private API surfaces without dedicated helpers. A relative path is scoped under the selected project:

```bash
node scripts/api-request.js --account work-us --path feature_flags/
node scripts/api-request.js --account work-us --path experiments/ --query-json '{"limit":20}'
node scripts/api-request.js --account work-us --path dashboards/
node scripts/api-request.js --account work-us --path surveys/
```

Use an absolute API path for organization-level or other non-project routes:

```bash
node scripts/api-request.js \
  --account work-us \
  --path '/api/organizations/ORGANIZATION_ID/'
```

Project placeholders in absolute API paths are expanded from `--project` or the profile:

```bash
node scripts/api-request.js \
  --account work-us \
  --path '/api/projects/:project_id/feature_flags/'
```

Common capability routing:

| Goal | Start with |
|---|---|
| Metric, trend, funnel, retention, path, or arbitrary SQL | `query.js` |
| Events, persons, cohorts, or property definitions | `api-request.js` or Query API |
| Feature flags | `feature_flags/` |
| Experiments and A/B tests | `experiments/` |
| Error tracking | Inspect the current API schema for error-tracking routes |
| Session replay | `session_recordings/` |
| Surveys | `surveys/` |
| LLM analytics | Query LLM events or inspect `llm_analytics/` routes |
| Dashboards and saved insights | `dashboards/` and `insights/` |
| Data warehouse | Inspect current `data_warehouse/` routes |

### Writes

Non-read methods return a preview by default:

```bash
node scripts/api-request.js \
  --account work-us \
  --path feature_flags/ \
  --method POST \
  --body-file /absolute/path/to/flag.json
```

Execute an intentional write by adding `--confirm`:

```bash
node scripts/api-request.js \
  --account work-us \
  --path feature_flags/ \
  --method POST \
  --body-file /absolute/path/to/flag.json \
  --confirm
```

Only pass `--confirm` when the user requested the change. Obtain immediate confirmation before destructive or broad production changes such as deleting resources, ending experiments, or changing a production rollout. After a write, read the resource again and report its final state.

The generic helper accepts only relative `/api/...` paths and project-relative resource paths. It rejects full URLs so the bearer key cannot be forwarded to an unrelated host.

## Script output

Commands emit structured JSON to stdout and errors to stderr. Metadata includes the selected account alias, host, project, request path, and timestamp, but never the personal API key.

Common errors:

| Code | Action |
|---|---|
| `POSTHOG_AUTH_MISSING` | Configure `POSTHOG_ACCOUNTS` or the single-profile variables |
| `POSTHOG_ACCOUNT_AMBIGUOUS` | Add `--account <alias>` |
| `POSTHOG_ACCOUNT_NOT_FOUND` | Check `list-accounts.js` |
| `POSTHOG_PROJECT_REQUIRED` | Add `projectId` to the profile or pass `--project` |
| `POSTHOG_AUTH_INVALID` | Replace the personal API key and verify the private API host |
| `POSTHOG_PERMISSION_DENIED` | Add the required key scope or verify project membership |
| `POSTHOG_NOT_FOUND` | Verify the account, project, route, and resource ID |
| `POSTHOG_RATE_LIMITED` | Narrow the request and retry after backoff |
| `POSTHOG_API_ERROR` | Inspect the returned HTTP details and current API docs |

## Official references

- [API overview](https://posthog.com/docs/api)
- [Personal API keys](https://posthog.com/docs/api/personal-api-keys)
- [Query API reference](https://posthog.com/docs/api/query)
- [API query guidance](https://posthog.com/docs/api/queries)
- [HogQL and SQL](https://posthog.com/docs/sql)
- Live schema: `<private-host>/api/schema/swagger-ui/`
