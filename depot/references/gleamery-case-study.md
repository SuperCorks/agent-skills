# Gleamery reference implementation

Historical record from 2026-08-30. It is evidence and a source map, not configuration to apply to another repository. The implementation is in `Red-Krypton/gleamery-appointments`; the parent Gleamery workspace is a separate meta-repository. Other child applications may have managed Lovable/Shopify build/publish paths and must be assessed independently.

## Implemented architecture

```text
GitHub Actions (existing triggers and environment approvals)
  ├─ Depot runner selected by LINUX_RUNNER
  ├─ Depot project via GitHub OIDC
  │    ├─ shared dependency / Prisma layers
  │    ├─ full lint target
  │    ├─ parallel component + integration targets
  │    └─ environment-specific standalone runtime image
  └─ Google Artifact Registry image@digest
       └─ isolated exact-image smoke
            └─ existing Cloud Run deployment of that same digest
```

Native/fork checks retain full validation on GitHub-hosted runners and local/native tools. Ordinary PR checks are independent of label-triggered previews.

## Historical choices, not universal defaults

| Item                        | Gleamery choice                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Runner variable             | `LINUX_RUNNER`, intended `depot-ubuntu-24.04-4`, fallback `ubuntu-24.04`                         |
| Builder project             | Named `gleamery-appointments`; actual ID kept in GitHub `DEPOT_PROJECT_ID`                       |
| Authentication              | GitHub OIDC to Depot; existing GCP service-account-key deployment auth retained                  |
| Build region/cache          | US East; 14-day build cache retention recorded at rollout                                        |
| Native switches             | `DEPOT_LINT_DISABLED`, `DEPOT_TESTS_DISABLED`                                                    |
| Deployment artifact/runtime | GAR, `linux/amd64`, Cloud Run                                                                    |
| Runtime packaging           | Next.js standalone, packaged locked migration/logging dependency trees                           |
| Runtime user                | `node:node`; writable `/app/uploads` and `/app/.next/cache` only within `/app`                   |
| Tests                       | Full component + integration suites, independent isolated image smoke, separate browser UI smoke |
| Local setup                 | No mandatory Depot CLI or `depot.json`; local development unchanged                              |
| Paid setup                  | Existing Developer plan with overage enabled; not permission to change another account           |

Dev remained push-to-`develop`, Staging push-to-`main`, Production release-tag-triggered, and previews same-repository/label opt-in. Public environment values require separate image builds; dependencies still share native cache. Test/lint targets are not pushed to GAR.

## Source map

The completed Staging content is anchored at commit `943135f9deb8d000afc8d16ec31f5768d37fda49`:

- [Deployment operations](https://github.com/Red-Krypton/gleamery-appointments/blob/943135f9deb8d000afc8d16ec31f5768d37fda49/docs/deployment.md): runner variables, native cache, fallback, environment triggers, runtime packaging, rollback.
- [Security boundaries](https://github.com/Red-Krypton/gleamery-appointments/blob/943135f9deb8d000afc8d16ec31f5768d37fda49/docs/security.md): source/cache and runner credentials, forks, non-root runtime.
- [Tests and verification](https://github.com/Red-Krypton/gleamery-appointments/blob/943135f9deb8d000afc8d16ec31f5768d37fda49/docs/tests.md): commands, fixture safety, actual coverage.
- `Dockerfile`, `Dockerfile.lint`, `.dockerignore`, `Dockerfile.lint.dockerignore`: reusable layer order and context separation.
- `.github/workflows/linting.yml`, `.github/workflows/tests.yml`: cached/native checks and parallel suites.
- `.github/workflows/deploy-dev.yaml`, `deploy-stg.yaml`, `deploy-prd.yaml`, `deploy-pr-preview.yaml`: suite dependency, pushed-digest smoke, unchanged deployment mechanism.
- `scripts/test-ci-workflows.mjs`: workflow contract regression checks.
- `scripts/test-docker-context.mjs`: real synthetic context inclusion/exclusion checks.
- `scripts/smoke-standalone-image.mjs`, `scripts/start-standalone.sh`: actual packaged runtime verification and startup.

Use authorized repository access to inspect these files. Do not require this checkout to exist for a new project; the other references explain the portable decisions.

## Evidence obtained

- Initial runner/builder changes: [PR #349](https://github.com/Red-Krypton/gleamery-appointments/pull/349), promoted through [PR #350](https://github.com/Red-Krypton/gleamery-appointments/pull/350).
- Subsequent standalone/runtime and cached-lint work preceded the final suite/non-root gates.
- Final Dev changes: [PR #353](https://github.com/Red-Krypton/gleamery-appointments/pull/353); [deployment run 33339084256](https://github.com/Red-Krypton/gleamery-appointments/actions/runs/33339084256) succeeded in 2m00s.
- Final Staging promotion: [PR #354](https://github.com/Red-Krypton/gleamery-appointments/pull/354); [deployment run 33339302492](https://github.com/Red-Krypton/gleamery-appointments/actions/runs/33339302492) succeeded in 3m06s.
- Dev and Staging readiness, read-only GraphQL, SSR, static assets, image optimization, and robots checks passed after deployment.
- Real Staging booking flow reached checkout without final submission. Real Dev flow completed checkout and rendered the correct sandbox appointment confirmation using synthetic details and a sandbox card, after explicit approval. The user chose to retain that sandbox test record.
- The task did not trigger a Production release. The production deployment then remained `v4.22.24`; this is historical status, not today's live status.

Those run durations are observed examples, not a controlled before/after benchmark or a promised speedup. Successful warm-cache behavior cannot be generalized to cold builds, other applications, or a different coverage matrix.

## Lessons worth carrying forward

1. Moving compute did not require moving GAR or Cloud Run. Treat registry migration as a separate decision.
2. Full lint needs a different context from a docs-insensitive application build; a global documentation exclusion can create false-green lint.
3. Auth-generated files can enter a path-context build unless both effective ignore files exclude them.
4. Cached suites and real image smoke solve different problems. Mocked integration tests did not replace actual PostgreSQL/Prisma startup coverage.
5. Slim standalone images require deliberate runtime dependency/configuration packaging, not just copying `.next/standalone`.
6. Non-root is useful only when the real runtime still works and code/configuration are not made writable as a shortcut.
7. A pushed image is not a deployed service; testing and deploying one immutable digest closed that gap.
8. Deployment-environment names do not establish payment safety: Staging used live Boulevard, Dev used sandbox.
9. Masked input and navigation console errors were observed during UI smoke but did not block the final journeys. They were not established as Depot regressions and were not fixed during validation-only work.
10. GitHub action-runtime deprecation remained a separate modernization follow-up; the application's pinned Node version was not the action's own runtime.
