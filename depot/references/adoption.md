# Adoption, authentication, and boundaries

## Discovery before setup

Inventory the current owner/repository, default/release branches, reusable workflows, runner labels, permissions, preview triggers, required status checks, package-manager/toolchain versions, Docker target platforms, build contexts, public build arguments, private runtime secrets, registry, runtime service, and deployment approvals. Check for duplicated work on the critical path.

Inspect existing account/integration state before creating another organization, project, trust relationship, or GitHub App installation. Do not reuse Gleamery IDs or select an account based only on a familiar browser avatar. Respect a project's guarded provider CLI or account-isolation mechanism; do not work around it with host-global credentials.

When setup needs an existing browser session, use the installed browser/computer-use skill. For Keeper, passkeys, CAPTCHA, or user takeover, follow the user's authentication/handoff rules. Never scrape cookie databases or put login tokens in the skill. Prefer a supported CLI/API for semantic configuration when available; check its current help/schema rather than guessing endpoints.

## Two independent onboarding tasks

### GitHub runner connection

Depot's GitHub Actions runners currently require a GitHub organization-owned repository. Connect the correct organization via Depot's GitHub Actions settings and the Depot GitHub App. Confirm installation approval and the intended repository access. Private-org app approval can block startup; public repository runner-group access is a separate decision, not permission to expose every repository. [Runner overview](https://depot.dev/docs/github-actions/overview), [setup](https://depot.dev/docs/github-actions/quickstart).

First prove a small job starts on the requested runner. A workflow containing a Depot label is not proof that the organization connection works.

### Remote container builder

Create or reuse a Depot project for the application's build/trust boundary. Choose region and cache retention deliberately. Sharing one app's cache across trusted environments can reuse dependencies; unrelated repositories or lower-trust code should not share a builder merely to save cache space.

Add a GitHub trust relationship in project Settings using the exact owner and repository name, plus available restrictions appropriate to the intended workflows. Set job-level `contents: read` and `id-token: write`. Pass the project ID through a repository variable such as `DEPOT_PROJECT_ID`. A `depot.json` file and local CLI installation are optional when CI supplies the project explicitly. [GitHub integration](https://depot.dev/docs/container-builds/integrations/github-actions).

Do not add a static `DEPOT_TOKEN` when OIDC works. Existing explicit tokens can override OIDC: the CLI checks the flag, environment token, and local login before its OIDC option. If a non-OIDC provider genuinely needs a token, prefer narrowly scoped credentials stored through its secret mechanism, and verify scope without printing the value. [CLI authentication](https://depot.dev/docs/cli/authentication).

Cloud authentication remains independent. Prefer federation for a new cloud integration. If the approved optimization preserves an existing service-account-key path, state that clearly; adding Depot OIDC does not eliminate the cloud key.

## Runner sizing and cost

Use a repository variable, e.g. `LINUX_RUNNER`, with an explicit GitHub-hosted fallback. The Gleamery choice was `depot-ubuntu-24.04-4`: 4 CPU / 16 GB, listed at $0.008 per wall-clock minute and 2x included-minute consumption on 2026-08-30. This is a historical sizing example, not a default for every job. [Runner types](https://depot.dev/docs/github-actions/runner-types).

Record current subscription, included usage, overage setting, runner multipliers, build minutes, storage/cache retention, and registry transfer mode. Verify account usage before starting broad matrices or repeated cold builds. A bigger runner can cost more without shortening a remote builder's work. Parallelism shortens the critical path but increases concurrent capacity and potentially total spend.

Use the live [pricing page](https://depot.dev/pricing) for decisions. A previous project's approved paid plan or overage does not authorize billing changes for another account. Stop at a billing/permission blocker and report the exact missing approval; do not buy capacity or loop paid attempts to “make it pass.”

## Registry decision

**Keeping the existing deployment registry is a useful default, not a Depot restriction.** Gleamery builds on Depot, pushes to Google Artifact Registry, and deploys the verified GAR digest to Cloud Run. It gets remote build caching without changing production pull authentication, registry IAM, cleanup policy, or runtime configuration.

Current Depot Registry supports both ephemeral build output and primary OCI registry use. `save: true` / `depot build --save` saves a build result; `push: true` exports to the image's tagged registry. These are separate from caching layers and do not imply deployment. Evaluate registry migration only when requested and justified by pull/push timing, runtime compatibility, region, access controls, provenance requirements, and retention/rollback needs. [Registry overview](https://depot.dev/docs/registry/overview).

Check repository retention separately from project-saved-image retention. Current docs say project-saved images default to Unlimited; older articles describe seven-day defaults. Do not copy old limits as current facts. Standard and Fast CDN transfer have different billing; changing CDN speed is organization-wide. A working pull today does not prove that an image will survive the rollback window. Keep deployment images until the owning release policy permits deletion. [Retention and transfer](https://depot.dev/docs/registry/overview).

For token-based registry login, use secure stdin handling, not a password in command arguments or logs. Do not create pull-through credentials or migrate stored images as a side effect of merely accelerating builds.

## Security review points

- Depot runners execute the entire job, including GitHub secrets, temporary cloud credentials, registry authentication, and deploy commands. Builder-only adoption has a narrower but still material source/cache boundary.
- A project's build access is effectively builder access. Share cache only across compatible trust domains; document the selected region and retention. [Depot security](https://depot.dev/docs/security).
- Runner caches are repository-scoped but not necessarily branch-isolated. Namespace sensitive cache keys and keep untrusted work out of trusted cache paths; do not cache credentials. [Runner cache model](https://depot.dev/docs/github-actions/overview).
- OIDC permission is not an isolation mechanism for malicious code running in the same job. Use job-level trust conditions and secret-free fallback jobs, not just `if` on the auth step.
- Avoid `pull_request_target` checking out and executing untrusted head code. Preserve explicit same-repository checks even if GitHub currently withholds fork secrets.

## Do not conflate with Depot CI

Changing `runs-on` inside GitHub Actions is not a move to Depot's own CI platform. Full Depot CI migration can change token issuer/subject, secret storage, compatibility, and workflow execution. It needs a separate scope and review. Current Depot CI has its own automatic job token behavior; do not transplant that guidance into GitHub Actions. [Depot CI OIDC](https://depot.dev/docs/ci/oidc), [container builds in Depot CI](https://depot.dev/docs/container-builds/integrations/depot-ci).

When full migration is in scope, use [depot-ci.md](depot-ci.md) for compatibility checks, organization-wide job-token access, explicit failure guards, federation, scoped secrets, and a cutover with one automatic publisher. A repository ineligible for Depot's GitHub Actions runners may still be eligible for Depot CI; verify Code Access installation without transferring repository ownership.
