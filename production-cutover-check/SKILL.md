---
name: production-cutover-check
description: Before and right after a launch, go-live, DNS cutover, store or domain switch, or promotion of a test/staging setup to production, prove that every production variable, credential, OAuth client, webhook, and connection points at the production system and not at a dev, test, staging, or preview one. Use whenever a production environment is created, switched over, or launched, or when users see test names, test data, or test emails in production.
---

# Production Cutover Check

Projects are usually built against dev or test systems (a test store, a staging database, sandbox payment keys, a preview email domain). At launch, some of those connections get switched and some get forgotten. A forgotten one still works, so nothing fails. It just quietly sends real users to the test system. Run this check before the cutover, again right after it, and whenever someone reports test branding or test data in production.

## 1. Inventory every connection

List every place the production runtime talks to another system, for each app or deployed project:

- Production configuration in every store that holds it: hosted env vars (Vercel, Netlify, EAS), CI secrets and variables (GitHub Actions), and secret managers (Google Secret Manager, AWS Secrets Manager or SSM). Check every name, not just the ones you expect to matter.
- OAuth and sign-in clients: client IDs, authorize/token/logout endpoints, redirect, origin, and logout URIs.
- API credentials and the account, store, project, or tenant each one belongs to.
- Webhooks and callbacks in both directions: what the provider sends to production, and what production registers with providers.
- Databases and storage: branch, project, and bucket.
- Email: sender domain, sending service, and the account or store named in transactional emails.
- Payments: live vs test keys, and the payout account.
- DNS, domains, and redirects; analytics and error-tracking projects; scheduled jobs and their targets; installed third-party apps and channels.
- Configuration that lives in provider dashboards rather than in env vars, such as the store or app name customers see.

## 2. Resolve each value to the system it actually reaches

For each item, record its intended production target and the target you actually observed. Do not trust names, dates, or memory.

- Read plain values directly.
- A Sensitive or unreadable value is **unverified**, not assumed correct. If it isn't a real secret, convert it to a plain variable as part of the fix, so the next check can read it. Prove its target from live behaviour: follow the production sign-in redirect and read the host, store ID, and client ID; check which account a token's identity call returns; look at webhook delivery logs; send a test email and read the sender.
- Watch for IDs and hostnames that belong to the test system, such as `*-test*`, `staging`, `sandbox`, `preview`, `localhost`, a test store's numeric ID, or test-mode key prefixes (for example `sk_test_`).
- Check the reverse direction too: production data or webhooks flowing into a dev or test system.

## 3. Check data stamped by the old target

If production ran against a test system for any period, records may hold that system's identifiers (customer or account IDs, payment IDs, webhook subscription IDs). Find them before switching, and plan how they will re-link to the production system's IDs so users don't end up with duplicate accounts or lost history. Back up whatever you change.

## 4. Switch, then verify live

Make changes through the project's approved provider path, store each value as a secret or a plain variable per `provider-cli-container` ("Classify configuration values: secret or plain"), redeploy, and repeat step 2 against the live deployment. Complete one real end-to-end flow per connection where practical, such as signing in, receiving an email, placing a test order, or receiving a webhook.

## Report

Give a table with one row per connection: name, where it lives, intended target, observed target, evidence, status (`ok`, `wrong target`, `unverified`), and fix. List every `wrong target` and `unverified` row as a launch blocker or explicit follow-up. Never report the check as passed while any row is unverified.
