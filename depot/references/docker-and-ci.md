# Docker builds and cached CI

The snippets below are adaptation patterns, not complete deployment workflows. Preserve the target repository's package manager, runtime/toolchain versions, architecture, scripts, secrets, and release triggers. Resolve action versions to reviewed full commit SHAs when implementing; the major tags here make the examples readable.

## Separate runner and builder switches

The runner expressions in this section select machines within GitHub Actions.
They are not a way to leave Depot CI; see [Depot CI compatibility](depot-ci.md#compatibility-and-account-boundaries).

For a trusted push/deploy job:

```yaml
runs-on: ${{ vars.LINUX_RUNNER || 'ubuntu-24.04' }}
```

For jobs that can run on pull requests:

```yaml
runs-on: ${{ (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) && vars.LINUX_RUNNER || 'ubuntu-24.04' }}
```

Changing `LINUX_RUNNER` does not disable a Depot builder action. Likewise, disabling cached tests does not necessarily stop native tests from running on a Depot runner. Document each switch independently.

## Remote build action

Keep existing registry authentication before the build. Use explicit path context when local checkout changes or generated files are intended inputs.

```yaml
permissions:
  contents: read
  id-token: write
steps:
  - uses: actions/checkout@v4
    with:
      persist-credentials: false
  - uses: depot/setup-action@v1
  - uses: docker/setup-buildx-action@v3
  # Keep the existing registry login steps here.
  - name: Build and push
    id: build
    uses: depot/build-push-action@v1
    with:
      project: ${{ vars.DEPOT_PROJECT_ID }}
      context: .
      file: Dockerfile
      target: runner
      platforms: linux/amd64
      push: true
      buildx-fallback: true
      tags: ${{ env.IMAGE_REPOSITORY }}:${{ github.sha }}
```

Adapt `target` and `platforms` to the image/runtime; do not add multi-platform output to an amd64-only service without a reason. Preserve existing provenance/SBOM policy. Gleamery's `provenance: false` and `sbom: false` are compatibility choices in that implementation, not a speed recommendation for other projects.

Depot's native cache normally replaces Docker `cache-from/to: type=gha` in these remote build steps. Do not delete ordinary `actions/cache` or `setup-node` package caches just because Docker cache exporters changed. Keep explicit external cache exports only for an identified consumer. `buildx-fallback: true` requires Buildx setup and addresses failure to acquire a Depot builder; it is not a retry for failing tests, compilation errors, registry auth, or a runner that never started. [Action inputs and behavior](https://github.com/depot/build-push-action).

Fail early with a clear message if a deployment requires a nonempty project variable. Cached check jobs can instead select a deliberate native path when the variable is missing. Neither behavior should silently skip validation.

## Make the build graph reusable

Put stable, expensive prerequisites before changing source:

1. Base OS/toolchain and required native build libraries.
2. Package manifest and exact lockfile; deterministic dependency installation.
3. Schema/code generation inputs and generation command.
4. Environment-specific public build configuration, where required.
5. Application source and build.
6. Minimal runtime assembly.

Use package download and compiler/framework cache mounts where useful. Gleamery used a named npm cache and a locked `.next/cache` mount. Keep dependency-stage instructions aligned across Dockerfiles so identical inputs can share layers. Do not add commit timestamps, run IDs, or environment-specific arguments before shared prerequisites unless they are real inputs.

Public frontend configuration may be compiled into the bundle. If Dev/Staging/Prod use different public values, retain separate environment builds while sharing their dependency cache. Do not claim “build once, promote everywhere” until configuration is truly runtime-resolved. Public build variables still need correct values; “public” does not mean irrelevant to cache identity.

## Build contexts are part of correctness and security

Inspect the effective ignore file for each Dockerfile. A Dockerfile-specific file such as `Dockerfile.lint.dockerignore` takes precedence; it must carry its own credential exclusions.

Common exclusions to adapt in **both** app and check contexts:

```dockerignore
.git
**/node_modules
.next
coverage
test-results
playwright-report
**/.env
**/.env.*
**/secrets.env
**/.npmrc
**/*.pem
**/gha-creds-*.json
```

This is not a complete credential policy. Inventory the project's cloud config directories, credentials, exports, keys, and generated files; account for nested paths. An ignored `.npmrc` may contain non-secret registry configuration needed for installation—supply a sanitized configuration or a BuildKit secret instead of copying a private file. Do not upload real secrets to test exclusions.

The temporary `gha-creds-*.json` file can be created in the checkout by Google authentication **before** the build. `.gitignore` is not a Docker security boundary.

An application context can omit documentation and workflow files that do not affect its build. A full lint context must retain every non-secret file the normal lint command checks, including docs, workflows, tests, and infrastructure. Do not use a blanket nested Markdown exclusion if the app consumes Markdown/MDX at runtime. Exclude local formatting/typecheck caches so stale state cannot falsify results.

Use synthetic BuildKit context tests to prove actual inclusion/exclusion, including Dockerfile-specific precedence and nested credentials. String matching ignore patterns alone does not prove their behavior.

## Cache deterministic lint and tests as targets

Given an appropriate shared `deps` stage:

```dockerfile
FROM deps AS check-source
COPY . ./

FROM check-source AS lint
RUN npm run lint

FROM check-source AS component-tests
RUN --network=none CI=true npm run test:component

FROM check-source AS integration-tests
RUN --network=none CI=true npm run test:integration
```

These script names illustrate Gleamery, not a universal Node contract. Keep the full original formatting, lint, typecheck, and assertion coverage. Include relevant configuration, fixtures, schemas, and generated-code inputs before the check. Do not substitute `lint:fast`, drop docs, or add `continue-on-error` to improve timings.

Run independent suites with a matrix and `fail-fast: false` when complete failure visibility is useful. Build the corresponding target with `push: false`; no deployment registry artifact is needed for lint/test-only targets. `load: true` is needed when a downstream Docker smoke harness actually runs the image, not just to cache a successful `RUN` instruction.

Disable network during suites whose external providers are mocked and whose dependencies are already installed. Gleamery's integration suites qualify; its real PostgreSQL/Prisma coverage lives in a separate disposable image smoke test. A suite using live APIs, changing databases, time-sensitive state, or uncontrolled randomness must actually rerun and cannot be treated as an exact-input cached truth. Use a noncached runtime test or stage-specific cache bypass for those checks; do not silently mock a real integration just to cache it.

An exact cache hit means a prior successful check for those inputs, not fresh test execution. Periodically or on request run an uncached check to validate assumptions. Cache reuse can remove per-test logs; preserve the coverage/report artifacts the project actually requires.

## Trusted and native jobs

One example cached-job condition:

```yaml
if: ${{ vars.DEPOT_PROJECT_ID != '' && vars.DEPOT_TESTS_DISABLED != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}
permissions:
  contents: read
  id-token: write
```

Create a native job with the exact complementary condition. Use the same package/toolchain versions, code generation, suite commands, and failure semantics. For forks, force GitHub-hosted runners and local Docker builds; request `contents: read` and `id-token: none`, with no deployment environment or inherited secrets. A separate lint switch can use the same structure.

Do not rely only on GitHub's default fork-secret policy or on a step-level guard: a job could already have allocated a paid runner or gained an OIDC capability. New event types/reusable callers need explicit trust review. Avoid evaluating untrusted metadata as shell code; pass values through environment variables or validated action inputs.

Make required status checks work on both paths. When introducing mutually exclusive jobs, verify branch protection and any aggregate gate do not accept an unintended all-skipped run or demand a job name that cannot run for forks.

## Gate deployment on the exact artifact

Use a reusable suite workflow for the same checked-out commit, without inheriting deployment secrets. Require it with `needs` before building/deploying. On ordinary PRs, build a fixture-configured local image and smoke it without cloud credentials.

### Resolve the runnable image manifest

A build output digest can identify an OCI index or Docker manifest list even
for a single target platform: attestations can be separate descriptors in that
index. Cloud Run may report the child image digest in its ready revision. Do not
fix a mismatch by skipping equality checks or disabling provenance.
[Docker attestation storage](https://docs.docker.com/build/metadata/attestations/attestation-storage/).

For a runtime that deploys one platform, inspect the pushed reference with
`docker buildx imagetools inspect --raw`. If it is an index, select exactly one
runnable descriptor matching the intended OS, architecture, and variant when
applicable; exclude attestation descriptors such as `unknown/unknown`. Reject
missing or ambiguous matches and unsupported manifest types. If already a
supported runnable manifest, retain its digest. Pull that reference with the
intended platform and verify the image architecture before smoke testing.

Test, deploy, and compare the same resolved digest. Keep the original index and
attestations under the existing retention policy; selecting a child is not a
reason to delete provenance. Multi-platform promotion needs its own verification
policy rather than blindly selecting the first child.

On deployment runs, a project-owned resolver step named `runtime-image` can
provide the verified runnable digest:

```yaml
- name: Smoke-test the pushed image
  shell: bash
  env:
    IMAGE_DIGEST: ${{ steps.runtime-image.outputs.digest }}
    IMAGE_REF: ${{ env.IMAGE_REPOSITORY }}@${{ steps.runtime-image.outputs.digest }}
  run: |
    [[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
    docker pull "$IMAGE_REF"
    node scripts/smoke-image.mjs "$IMAGE_REF"

# Pass that identical IMAGE_REPOSITORY@digest to the existing deployment action.
```

`scripts/smoke-image.mjs` is a project-owned harness to implement or adapt, not a script supplied by this skill. It should use isolated fixtures, not deployed databases. Validate the digest format and ensure smoke failure blocks the deploy. A mutable tag—even a convenient `dev` tag—is not the identity of the tested artifact.

A deployment caller can skip a redundant fixture-image build **only** when it smoke-tests its actual pushed image before deployment. Do not skip the component/integration suites. Ordinary PR checks stay independent of preview labels; same-repository previews remain explicitly opt-in. Keep production's existing release trigger and approval gate unchanged.
