# Next.js standalone runtime lessons

Use this reference only when image slimming or a similar Next.js runtime is in scope. These improvements complemented Depot; adopting Depot alone does not require a runtime refactor. Verify the target Next/Prisma/Node versions and its tracing behavior before adapting the Gleamery implementation.

## Standalone packaging

Gleamery enabled Next's `output: "standalone"`, copied the traced output into the final image, added `.next/static` and `public` explicitly, and launched `node server.js`. It stopped copying the complete build/test dependency tree into the runtime. The image still needed selected runtime files outside the trace.

Inventory at least:

- Static/public assets, image optimization dependencies, and generated build markers.
- Prisma schema, configuration, migrations, generated client, native engines, and the migration CLI when migrations run at startup.
- Worker-thread/dynamically loaded logging transports and their dependency trees.
- Configuration/assets read by runtime path, such as YAML/Markdown, rather than static imports.
- Public build-generated environment values, where the existing app uses them.
- Writable uploads, caches, temporary directories, and any ISR storage.

Gleamery's copied `.env.local` was generated inside the build from public values; host `.env*` files were excluded from the build context. Never generalize that into copying a developer's private `.env.local` into an image.

## Prisma and logging were the non-obvious trace gaps

Next's standalone trace did not package every dependency required by the separate Prisma migration command and dynamically loaded Pino worker. Copying just the top-level package directories was insufficient: the Prisma config loader has nested dependencies, and the migration CLI needs a native schema engine.

The implemented solution assembled a separate `runtime-deps` tree rooted at `prisma`, `pino-abstract-transport`, and `thread-stream`, taking versions from the application's lockfile. It verified each resolved package's version, URL, and integrity against that lockfile before installation. This was preferable to either copying all development dependencies or installing unconstrained “latest” runtime packages.

For another app, identify its actual missing runtime roots. Preserve package-manager lock semantics and required transitive dependencies. Do not blindly copy this package list, manufacture a loosely locked dependency tree, or assume `npm prune --omit=dev` retains a CLI declared only as a development dependency. Prove both module resolution and actual runtime behavior in the final image.

## Native libraries and architecture

Gleamery used Debian slim with CA certificates/OpenSSL, optional dependency installation, and an early `require('sharp')` probe. Its dependency stage included native build tools. These choices avoided treating a successful JavaScript compile as proof that the target architecture's native modules work.

Build for the deployed platform, not implicitly for the developer laptop. Test the actual Sharp image transformation and cache write in the final image. A module import alone does not validate the full optimizer path. Confirm Prisma engines are available and executable under the final user.

## Startup

The container entrypoint runs packaged `prisma migrate deploy`, stops on migration failure, then uses `exec node server.js` so the server receives termination signals. It binds `HOSTNAME=0.0.0.0` and honors the runtime's `PORT`.

Keep this compatible with the target project's migration strategy. Some applications use a separate migration job; do not move migrations to startup merely to imitate Gleamery. Test a fresh database, repeat startup, and an unreachable database. Preserve existing Cloud Run network/Cloud SQL/IAM/secret configuration unless explicitly in scope.

## Non-root without writable code

Gleamery's final image uses `USER node:node` for both migrations and the server. Application code, configuration, dependencies, Prisma files, and static assets stay root-owned. Within `/app`, only `uploads` and `.next/cache` are owned by the application user. `/tmp` and the node user's home support temporary/runtime tooling needs.

Do not fix missing write permissions with `chmod -R 777` or recursive ownership of all `/app`. Identify the exact writable path and add a regression test. Disk-backed ISR under `.next/server` was not required by Gleamery; an app that uses it needs an explicit cache/storage design rather than writable compiled server code.

Verify the final image's configured user and live process UID, successful writes only to intended directories, denied writes to code/configuration, image optimization, uploads, migration success/failure, and graceful signal handling. Keep credentials and real data volumes out of the harness.

## Version discipline

Gleamery's rollout used Node 22.12 and npm 10.9; those are historical lockstep inputs, not current recommendations. A GitHub action's internal JavaScript runtime is distinct from the application Node version chosen by `setup-node`. Address action-runtime deprecation through supported action versions and verified pins; forcing an undocumented runtime flag is not a substitute for a tested upgrade.
