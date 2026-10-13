# ban family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@nizam-os/ban-core` (the framework-free core) and `@nizam-os/hono-ban`
(the Hono binding). Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/ban/DESIGN.md` for intent and `docs/ban/SPEC.md` for the exact contract before changing
  public API. Implement from the SPEC section named in the file header; update the SPEC in the same
  PR when the code must differ. Read the relevant ADR in `docs/ban/adr/` before changing a decision
  it records; add a new ADR instead of silently reversing one.
- Doc-driven, not memory-driven. Before using any external API (Hono, Zod, Standard Schema, OpenAPI,
  npm packaging, RFC 9457, JSON:API), fetch the canonical document and cite it in the code with an
  `@ref <url>` comment next to the decision it justifies.
- Adding a wire format, a validator hook, or an observability module: follow "Adding a format or
  adapter" in `CONTRIBUTING.md`, which lists the acceptance policy and every file to touch.
- The error handler never throws and never reveals server internals by default. Any change to
  `packages/ban-core/src/handler/` must keep the single-invocation and constant-500-detail tests
  green.
- `packages/ban-core` imports nothing from Hono, not even types; anything that needs a Hono type
  belongs in `packages/hono-ban`, which imports `@nizam-os/ban-core` by package name (resolved to the
  core's `src/` in-repo through the `source` export condition).

## Repository map

- `packages/ban-core/src/core/` error class, error items, status codes, definitions catalog,
  factories, `createBan`
- `packages/ban-core/src/formats/` wire formats (RFC 9457, JSON:API, plain, Google API, Stripe) and
  `defineFormat`
- `packages/ban-core/src/headers/` `bearerChallenge()`, the RFC 6750 `WWW-Authenticate` builder
- `packages/ban-core/src/handler/` the framework-free handler, `fromRequest`, and error mapping
- `packages/ban-core/src/validation/` validation-issue normalization and validator hooks
- `packages/ban-core/src/openapi/` response schema helpers
- `packages/ban-core/src/observability/` the OpenTelemetry trace id adapter
- `packages/ban-core/src/postgresql/` the Postgres SQLSTATE mapper (`@nizam-os/ban-core/postgresql`)
- `packages/ban-core/src/testing/` consumer test helpers and format conformance
- `packages/ban-core/src/internal/` helpers that are never exported
- `packages/ban-core/src/test-support/` helpers for the repository's own tests (Ajv compiler,
  handler dispatch); not published
- `packages/hono-ban/src/` the Hono adapter: `createBan` with `onError`, `HTTPException` adoption,
  one-line re-exports of every core subpath, and the tests that need Hono or its middleware
- `e2e/ban/` end-to-end suite: a private workspace package that consumes the built
  `@nizam-os/ban-core` and `@nizam-os/hono-ban` through `workspace:*` and drives them over real HTTP
  with `@hono/node-server`; never imports from `src/`. `e2e/ban/smoke/` is the runtime smoke test
  (Bun, Deno, workerd)
- `docs/ban/DESIGN.md` what we are building and why; `docs/ban/SPEC.md` the normative contract;
  `docs/ban/adr/` decisions
