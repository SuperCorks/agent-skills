# Verification, measurement, and rollback

## Evidence ladder

Use the narrowest checks appropriate to the requested change, then prove the material boundaries:

1. **Static contracts:** workflow syntax/action inputs, trigger preservation, trusted/native conditions, permissions, suite dependencies, status-check naming, exact digest propagation, and fatal failures.
2. **Context behavior:** synthetic BuildKit exports prove what the app and lint/test contexts include/exclude. Test nested credentials and Dockerfile-specific ignore precedence.
3. **Checks:** complete lint and test suites on accelerated and native paths. Distinguish cache hits from executed suites; run an uncached regression where meaningful.
4. **Final image:** real isolated database/migrations, server startup, native modules, assets/configuration, process identity, writable/forbidden paths, graceful shutdown, and startup failure. Use stubs for external business providers.
5. **Real CI:** job actually ran on the intended runner; build actually authenticated to the intended Depot project; cache behavior and fallback are observable; all required gates passed for the intended commit.
6. **Deployment:** exact tested registry digest is the ready revision's image; HTTP readiness, read-only API/GraphQL, SSR, static assets, image optimization, and intended runtime configuration work.
7. **User journey when requested:** navigate the real deployed flow. Do not replace a UI smoke with direct API calls or mocked browser responses and call it end-to-end.

Do not report “deployed” because an image was pushed, “tested” because a job was skipped, or “faster” based only on a vendor claim. Keep blocked checks and unrelated baseline failures visible. Validation-only work does not authorize application fixes or deleting failing tests.

## Safe Docker fixtures

An image smoke harness should respect the caller's Docker context, require the target image explicitly, and use uniquely named disposable containers/networks. Pre-pull declared fixture images if required. Use an internal network where appropriate, temporary databases, synthetic public configuration, and stub providers. Do not mount host home/config directories, deployment credentials, or real data volumes.

Clean up only resources that the harness created, preferably in a `finally`/trap path. Avoid broad Docker prune commands. A full local database is not necessary for every mocked component/integration suite, but actual migration/runtime behavior needs a real database fixture.

For the Gleamery source, useful exact commands were:

```sh
node --test scripts/test-ci-workflows.mjs
node --test scripts/test-docker-context.mjs
docker pull postgres:16-alpine
node scripts/smoke-standalone-image.mjs IMAGE_TAG_OR_DIGEST
npm run lint
npm run test:component
npm run test:integration
```

These scripts live in that repository, not this shared skill. Run under its pinned Node/package-manager version, or implement equivalent public-boundary checks in another project. Do not copy a large app-specific smoke harness without adapting every route, asset, dependency, fixture, and cleanup target.

## Deployed browser smoke boundaries

An environment name is not a payment/provider safety guarantee. In Gleamery, Staging used live Boulevard while Dev used sandbox Boulevard and its sandbox card vault. Verify actual configuration before submitting test data.

For a “Staging to checkout / Dev past checkout” request: stop Staging before final submission; in Dev use synthetic contact data and documented sandbox payment data, follow the browser tool's action-time confirmation rules, submit once, and inspect the resulting confirmation and sandbox appointment reference. Do not subscribe real users to promotions, submit optional attribution surveys, or cancel records without applicable authority.

Temporary checkout holds may expire while awaiting approval. Restore the approved selection only if still available; do not silently substitute a different service/time/price. Recheck defaults such as SMS consent after form reset. Use explicit `setChecked(false)` for opt-out rather than an ambiguous toggle.

Masked inputs may need normal sequential typing instead of bulk fill. Gleamery's phone field emitted a `getPostDelimiter`/`slice` TypeError during bulk fill but accepted sequential typing. Record this as observed behavior, not proof of a Depot regression. Likewise, navigation `AbortError` logs did not prevent checkout; do not claim a clean console when errors were present. Investigate causality before treating such logs as migration defects.

Keep created sandbox-record identifiers in the task report rather than embedding customer/test appointment data in this shared skill. Respect an explicit user decision to leave test records in place.

## Measure the right work

Record commit/image identity, runner CPU/memory, platform, cache state, and the work each measurement includes. Compare cold and warm builds, docs-only changes, source-only changes, and dependency/schema changes when practical. Separate queue delay, dependency install/codegen, lint/tests, compilation, image export/push/pull, smoke test, and runtime deployment.

Report critical-path wall time and total compute usage separately. A parallel suite matrix can improve wall time without reducing total billed work. A cached check can be almost instantaneous but is not a fresh suite run. Compare like-for-like runs; branch differences, changed public build values, action updates, and different test coverage invalidate simple speedup ratios.

Watch image compressed/pulled size and startup readiness in addition to build time. Depot cannot remove rollout health checks, database migration latency, or managed-host publishing that happens outside the migrated jobs.

## Troubleshooting map

| Symptom                                         | Check before changing code                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Job stays queued                                | GitHub App/org approval, repository/runner-group access, label, plan/billing; remote-build fallback cannot run before a runner starts |
| Builder authentication fails                    | Correct project variable, exact repo trust, job OIDC permission, token precedence, intended event identity                            |
| GAR/ECR push fails                              | Independent registry/cloud auth, IAM, repository location; Depot OIDC does not grant registry access                                  |
| Repeated cache misses                           | Effective context, generated credential files, lockfile, Docker instruction order, public env inputs, volatile arguments              |
| Cached checks suspiciously pass                 | Missing docs/fixtures/config in check context, weaker command, stale tool cache, live-state dependency                                |
| Green workflow with absent tests                | Conditions, mutually exclusive jobs, reusable inputs, `needs`, all-skipped aggregate/status behavior                                  |
| Depot CI attempts work after a failed check     | Explicit `success()` on conditional jobs/steps; verify with a harmless intentional-failure probe in [depot-ci.md](depot-ci.md#explicit-failure-guards) |
| GCP rejects a mapped subject or workflow claim  | Subject byte length and actual issued `workflow_ref`; preserve exact trust restrictions when correcting the mapping in [depot-ci.md](depot-ci.md#google-workload-identity-federation) |
| Build succeeds, container fails                 | Standalone trace gaps, native modules/engines, complete CLI dependencies, file permissions, host/port, entrypoint                     |
| Image pushed but service unchanged              | Image smoke or deploy gate failed; inspect ready revision and digest rather than rerunning a release blindly                          |
| Healthy revision reports a different digest     | Index versus runnable platform manifest; [resolve, test, and deploy the same child digest](docker-and-ci.md#resolve-the-runnable-image-manifest) |
| Native fallback still incurs Depot runner usage | Check `LINUX_RUNNER`; check/builder disable switches do not select the machine                                                        |
| Action Node deprecation warning                 | Action's own runtime/version separately from application Node; use a reviewed supported upgrade                                       |

Stop on permission/billing blockers, ambiguous externally consequential submission results, or a need to broaden scope. Check the destination state before retrying any operation that could create duplicate deployments or records.

## Independent rollback controls

The runner switch below applies inside GitHub Actions. For a full Depot CI
migration, retain a separate orchestrator fallback and follow [publisher cutover](depot-ci.md#cut-over-one-publisher-at-a-time).

1. **Runner:** set the configured runner variable to the previous GitHub-hosted label, such as `ubuntu-24.04`. Already queued jobs may need cancellation/rerun under the user's operational authority; changing the variable does not relocate a running job.
2. **Cached lint:** enable the project's native-lint switch (Gleamery: `DEPOT_LINT_DISABLED=true`). Full lint still runs.
3. **Cached tests:** enable the native-test/local-image path (Gleamery: `DEPOT_TESTS_DISABLED=true`). Full suites and image smoke remain required. Deployment remote builds are separate.
4. **Builder:** transient acquisition failures can use the preconfigured Buildx fallback. To deliberately stop Depot builds, restore `docker/build-push-action` and an appropriate local/GHA/registry cache strategy through the normal change process.
5. **Runtime:** revert to an already-known-good retained image digest through the existing release/rollback policy. Changing the build service is not runtime rollback.

Never disable a required gate or switch a live secret/provider endpoint to get an outage “green.” Document which control was tested and which is only configured. No rollback requires a registry migration, broadened IAM, or production release unless the actual project architecture demands it.
