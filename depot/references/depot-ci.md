# Full Depot CI migration

Use this reference when workflow orchestration itself is moving to Depot CI.
For runner-only acceleration, keep GitHub Actions and use [adoption.md](adoption.md).
The operational lessons below were observed during a 2026-08-30/31 rollout with
Depot CLI 2.102.7. Vendor references were rechecked on 2026-08-31 UTC. Observed
failures are reasons to validate behavior, not claims that every version behaves
identically. Keep account IDs, secret names, and run history in the target repo.

## Compatibility and account boundaries

Connect Depot Code Access to the intended repositories in the chosen Depot
organization. The GitHub owner, Depot organization, and deployment-provider
account are independent identities; connecting them does not require transferring
ownership. Inspect the selected installation before creating another one.
Migration generates `.depot/workflows/` files, but generated compatibility edits
still require review. [Depot CI quickstart](https://depot.dev/docs/ci/quickstart).

Check the current [compatibility table](https://depot.dev/docs/ci/compatibility)
against the actual workflows, especially:

- GitHub deployment environments/approval gates are not supported as equivalent
  release controls. Inspect required reviewers and branch restrictions before
  cutover; retain GitHub deployment until an equivalent approved gate exists.
- A Depot secret's environment attribute matches metadata; it is not proof that
  GitHub's approval rules run. Do not add or remove an environment just to make
  credentials resolve. See [secret availability](https://depot.dev/docs/ci/how-to-guides/manage-secrets-and-variables).
- Fork-triggered PR workflows are unsupported. Keep necessary secret-free fork
  checks in GitHub; do not enable trusted Depot jobs through `pull_request_target`.
- Non-Depot runner labels do not provide GitHub-hosted fallback inside Depot CI.
  Separate orchestration fallback from builder fallback.

## Automatic build-token trust

Depot CI injects a short-lived `DEPOT_TOKEN` with access to all projects and the
registry in its Depot organization. A dedicated builder separates cache/history,
but does not confine that job token to the builder. Restrict code allowed to run
in the organization accordingly. Job-level GitHub permissions and provider-secret
filters do not narrow this Depot token.

Do not import a static `DEPOT_TOKEN` by default: it overrides the supplied job
token. Inspect any existing override and its consumers before changing it.
Google/AWS/other runtime and registry authorization remains separate.
[Container-build authentication](https://depot.dev/docs/container-builds/integrations/depot-ci#authentication).

## Explicit failure guards

During the rollout, a custom step condition evaluated true after an earlier step
failed. Do not assume GitHub's implicit success behavior transfers unchanged.
For conditional jobs or steps that must require prior success, combine the
business condition with `success()` and retain explicit repository/ref guards.
Deployment jobs must also depend on the complete check jobs through `needs`.

For a workflow whose approved policy is push deployment plus optional manual
deployment, the publish step condition is:

```yaml
if: success() && (github.event_name == 'push' || inputs.deploy)
```

Keep manual dispatch build-only by default during staging. Do not apply success
guards to cleanup/reporting that intentionally must run on failure.

Verify failure behavior in a disposable workflow without provider credentials,
publishing, or business side effects: force an early `exit 1`, then confirm both
a success-guarded conditional step and a dependent job are skipped. A normal
green run or YAML linter cannot prove this. Record the expected failed probe
separately from release results; do not weaken a gate to make it green.

## Google workload identity federation

Depot CI uses issuer `https://identity.depot.dev`; GitHub's issuer/trust mapping
does not transfer automatically. Request `id-token: write` only where needed.
Inspect a token from the intended event/workflow using a small allowlist of
non-secret claims; never print the JWT or request credential. Decoding claims
for diagnosis does not verify a token's signature—the cloud provider must do that.
[Depot OIDC](https://depot.dev/docs/ci/oidc).

In the observed run, `workflow_ref` was `owner/repo/cloud-run.yml@refs/heads/main`,
without `.depot/workflows/`. Pin the value actually issued, not a guessed path.
The full SPIFFE subject exceeded Google's 127-byte mapped-subject limit.
A working GCP-specific mapping was:

```text
google.subject=assertion.org_id + '/' + assertion.job_id
attribute.repository=assertion.repository
```

Verify the mapped identity is unique within the pool and within the length
limit. Keep separate exact provider conditions for the intended Depot org,
GitHub repository, release ref, event, and workflow; preserve audience validation.
Shortening the subject is not permission to broaden trust. Bind the deployer
through the mapped repository principal, not every identity in the pool.
[Google subject-length troubleshooting](https://docs.cloud.google.com/iam/docs/troubleshooting-workload-identity-federation#mapped_google.subject_claim_exceeds_the_127_bytes_limit).

Use a dedicated deployer with resource-scoped registry access, runtime read/update,
and `actAs` on the necessary runtime identities. Image deployment alone need not
grant Job execution, secret-payload access, deletion, or project administration.
Prove federation and registry push/pull in a build-only run before releasing.
Do not copy this GCP mapping into an AWS policy; claim support differs by provider.

## Secret import and restricted variants

Use an explicit allowlist with `depot ci migrate secrets-and-vars`; inspect the
generated one-shot workflow and destination scopes before running it. In the
observed importer, authorization was bound to the generated commit SHA. Amending
that commit broke authorization. Push the inspected commit unchanged; if it
needs editing, stop that attempt and regenerate authorization rather than editing
around the check. Inspect remote completion before retrying an uncertain import.

For new provider credentials, pass values through stdin rather than shell
arguments, literal commands, or logs. Confirm current CLI help. Example arguments
for a single release workflow, with the secret supplied separately on stdin:

```sh
depot ci secrets set DEPLOY_API_TOKEN release --from-stdin \
  --org "$DEPOT_ORG_ID" --repo "$DEPOT_REPOSITORY" \
  --branch "$DEPOT_RELEASE_BRANCH" --workflow "$DEPOT_WORKFLOW_FILE"
```

Use the actual branch name and workflow filename. In the observed configuration,
these were `main` and `newsletter-worker.yml`, not a full ref or directory path.
With no availability filters, a variant can apply across the organization.
Retain the variant's filters when rotating a value and check for overlapping
variants. Verify stored attributes with `depot ci secrets get ... --output json`
and confirm the intended variant resolves during a controlled run; never log
the value. [Secrets, variants, and matching](https://depot.dev/docs/ci/how-to-guides/manage-secrets-and-variables).

## Managed-provider credentials: Cloudflare example

For a durable Worker deployment integration, prefer an account-owned API token
when supported and available under the user's authority. Keep it in the account
that already owns the Worker; do not move resources to match the Depot org name.
[Cloudflare account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/).

One existing Worker with inherited Queue/R2 bindings deployed successfully with
Workers Scripts Write, Queues Write, and Account Settings Read. It needed no
direct R2 storage, DNS, billing, or token-management permission. This is evidence
for that configuration, not a universal minimum: provisioning resources or
changing bindings may need different grants. These Worker permissions covered
the account, not one script; document that limit alongside the Depot filters.

Do not copy an operator's OAuth profile or extract runtime secrets into CI.
Capture any newly created token privately, transfer it through secure stdin,
clear temporary plaintext, and record expiration/rotation policy without making
non-expiring credentials a default. After release, independently compare the
deployed version, routing, bindings, and runtime-secret presence with the baseline.
Do not read secret values, send real email, or execute ingestion just to prove
deployment. A `-dev` resource name is not evidence that it is unused or safe.

## Cut over one publisher at a time

Keep checks running alongside the existing CI during validation, but stage new
release workflows as manual/build-only. Preserve each target's actual release
policy: adopting Depot does not make a manual Cloud Run or Worker release
automatic. For images, follow [runnable-manifest verification](docker-and-ci.md#resolve-the-runnable-image-manifest).

Before the first approved release, let any existing publisher finish and disable
its automatic path. Release from the intended committed ref on Depot, verify the
actual destination, then transfer the automatic trigger in a reviewed change.
Check provider-native Git deployment too; two workflow files are not the only
possible duplicate publishers. Never enable both automatic paths as a test.

Verify the first real release event produces one intended deployment for its
commit. Retain a manual fallback with the same checks and clearly document when
the Depot publisher must be disabled before using it. A Depot outage requires
another orchestration path; local Buildx inside Depot is only a builder fallback.
For a failed or ambiguous release, inspect destination state before retrying.

Record the commit, workflow/job attempt, artifact digest or Worker version,
readiness/traffic, retained rollback version, and any skipped checks in project
docs. Updating a Job image and executing the Job are distinct actions. Successful
configuration reads do not establish live database, email, or audio behavior.
