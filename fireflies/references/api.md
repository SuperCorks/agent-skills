# Fireflies retrieval API

Verified against the official API docs and live queries on 2026-10-14. Recheck these links before changing query fields or assuming new capabilities.

- Endpoint: `POST https://api.fireflies.ai/graphql`
- Headers: `Content-Type: application/json`, `Authorization: Bearer <API key>`
- Body: `{ "query": "query ...", "variables": { ... } }`
- `user` without an ID returns the API key owner.
- `transcripts` supports keyword/scope, `fromDate`/`toDate` (`DateTime`), participant and organizer email arrays, `mine`, channel ID, limit, and skip. Page limit is 50.
- Keyword scopes: `title`, `sentences`, `all`. The API's default scope is title; the helper explicitly defaults search to all. Keyword maximum is 255 characters. Legacy `title`, `date`, `participant_email`, and `organizer_email` query filters are deprecated.
- `transcript(id: String!)` accepts an ID. The CLI also parses Fireflies `/view/<id>` and `/view/Meeting-Title::<id>` URLs locally; it never fetches arbitrary URLs supplied as meeting input.
- `date` is epoch milliseconds; `dateString` is ISO time; `duration` is minutes. Sentence times are seconds from the start of the recording. Action items are a generated string, not structured assignee/due-date records.
- `audio_url`/`video_url` are temporary signed URLs. These helpers omit them because transcript retrieval does not need media access.

Errors can be HTTP failures or GraphQL `errors[]` with HTTP 200. Preserve `code` or `extensions.code`, and reject partial data rather than report a partial result as complete.

Rate limits vary by plan and may be pooled across a team. `Retry-After` is seconds (or an HTTP date); `X-RateLimit-Reset` is seconds until reset. In the GraphQL body, `extensions.metadata.retryAfter` is an **epoch timestamp in milliseconds**, not a duration. Honor the block and stop when it exceeds the helper's bounded retry budget. Do not hardcode plan quotas or repeatedly probe a blocked account.

Skip pagination is not a snapshot: newly arriving meetings can move page boundaries. The helper deduplicates IDs, but a high-churn exhaustive audit may need a stable date window and reconciliation. `pagination.complete` describes exhaustion of the requested filters starting at `start_skip`; it does not establish access to every meeting in the organization.

Official references:

- [Documentation index](https://docs.fireflies.ai/llms.txt)
- [Current user](https://docs.fireflies.ai/graphql-api/query/user)
- [Meeting list and search](https://docs.fireflies.ai/graphql-api/query/transcripts)
- [Single transcript](https://docs.fireflies.ai/graphql-api/query/transcript)
- [Transcript fields and units](https://docs.fireflies.ai/schema/transcript)
- [Sentence schema](https://docs.fireflies.ai/schema/sentence)
- [Summary schema](https://docs.fireflies.ai/schema/summary)
- [Rate limits and retry metadata](https://docs.fireflies.ai/fundamentals/limits)
- [Errors](https://docs.fireflies.ai/fundamentals/errors)
