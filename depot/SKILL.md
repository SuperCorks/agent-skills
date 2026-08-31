---
name: depot
description: Set up, migrate, troubleshoot, and validate Depot.dev GitHub Actions runners, Container Builds, cached checks, Registry, and Depot CI. Use for CI/CD adoption or migration while distinguishing runner acceleration from moving workflow orchestration.
---

# Depot.dev

Adopt Depot for the requested CI and container work without weakening checks or silently changing hosting, credentials, release policy, or registry. This skill separates reusable guidance from project-specific rollout choices.

## Choose the actual change

Depot has distinct products; name the ones in scope before making changes:

| Layer                  | What changes                                         | What does not automatically change                       |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| GitHub Actions runners | Machine executing an existing GitHub job             | Workflow orchestration, triggers, runtime host           |
| Container Builds       | Remote BuildKit compute and persistent project cache | Final image registry or deployment target                |
| Depot Cache            | Remote cache for supported tools / runner caches     | Docker layer cache semantics or test correctness         |
| Depot Registry         | Storage/distribution of images and OCI artifacts     | Runtime deployment and release authority                 |
| Depot CI               | Workflow execution platform                          | Not the same migration as changing a GitHub runner label |

For “replicate the Gleamery setup,” start with GitHub Actions runners plus Container Builds, retain the existing registry/runtime, and add cached checks and exact-image smoke gates where appropriate. A repository without meaningful GitHub jobs or a container pipeline may have little to move. Do not invent Docker deployment for a managed frontend solely to adopt Depot.

## Routing

Read only the references needed for the task:

- New adoption, account setup, sizing, security, or registry decisions: [adoption.md](references/adoption.md).
- Full workflow migration to Depot CI, cloud federation, secret variants, or publisher cutover: [depot-ci.md](references/depot-ci.md).
- Workflow migration, Docker contexts, cached lint/tests, or deployment dependencies: [docker-and-ci.md](references/docker-and-ci.md).
- Next.js standalone images, Prisma, Sharp, logging workers, or non-root runtime: [nextjs-standalone.md](references/nextjs-standalone.md).
- Validation, performance claims, incident diagnosis, or rollback: [verification-and-rollback.md](references/verification-and-rollback.md).
- Reconstructing the proven implementation and its limits: [gleamery-case-study.md](references/gleamery-case-study.md).

## Operating sequence

1. Read the target repository's instructions and provider-access rules. Inspect branch/worktree state and existing workflows, Dockerfiles, lockfiles, deployment triggers, and test commands. In a multi-repository workspace, resolve each repository independently.
2. Record a baseline: commit, job/step durations, runner type, build platform, cache state, image size, and existing failures. Identify the actual slow stage before selecting more compute.
3. Confirm the Depot/GitHub organizations, allowed repositories, project/trust boundary, current plan, usage allowance, and requested rollout environments. Follow [adoption.md](references/adoption.md).
4. Implement the smallest approved slice. Keep runner selection, builder selection, cached checks, and registry migration independently reversible. Preserve local development unless requested otherwise.
5. Validate both accelerated and fallback paths. For deployments, test the exact image digest that will be deployed; successful builds and successful deployments are different claims.
6. Report changed repositories/configuration, observed runs and timings, unchanged boundaries, remaining failures, costs requiring a decision, and rollback instructions. Document project-specific values in that project's canonical docs, not in this shared skill.

## Essential invariants

- For builds orchestrated by GitHub Actions, prefer GitHub OIDC to Depot. Depot CI has a separate automatic job-token model. A Depot project ID is configuration, not a secret; Depot authentication does not grant access to GAR/ECR/GHCR or the deployment platform.
- Moving the runner moves the whole job's credential-processing boundary. Moving only the builder still sends the build context and cached layers to Depot.
- Exclude credentials from every effective Docker context, including Dockerfile-specific ignore files. Use secret mounts for necessary build secrets, never public build arguments or committed env files.
- Cached test success is meaningful only for complete, deterministic inputs. Do not cache checks whose truth depends on live external state; do not replace full checks with weaker “fast” variants.
- Untrusted fork code must not allocate a trusted paid runner or reach privileged builder/deployment credentials. Preserve required checks on a native/local path.
- Existing task approval is not a standing billing mandate. Obtain the required confirmation before plan changes, overage commitments, paid feature changes, or destructive cleanup. Do not keep retrying a blocked paid/authenticated operation without an in-scope reason.
- Preserve production triggers and environment approvals. A CI optimization does not authorize a release, registry migration, secret migration, or real payment/booking smoke test.

## Freshness

Vendor guidance was checked on 2026-08-30; the full Depot CI reference was checked on 2026-08-31 UTC. Recheck linked official docs before relying on prices, runner labels, action inputs, compatibility, product availability, or retention defaults. Keep dated observations distinct from documented guarantees and do not turn historical versions or measurements into permanent requirements.
