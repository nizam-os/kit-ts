# Contributing to the ban family

`@nizam-os/ban-core` (the framework-free core) and `@nizam-os/hono-ban` (the Hono binding). The root
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) covers setup, the quality gates, the shared conventions,
commits, changesets, and releases; this guide adds what is specific to the family. Design intent
lives in [`DESIGN.md`](DESIGN.md), the normative contract in [`SPEC.md`](SPEC.md), and decisions in
[`adr/`](adr); read those before proposing API changes.

## Layout

- `packages/ban-core` is the framework-free core and `packages/hono-ban` the Hono adapter (ADR
  0016). Behavior lives in the core; the adapter owns only what needs a Hono type (`create-ban.ts`,
  `http-exception.ts`) and one-line re-exports of each core subpath. A change to a format, hook, or
  the handler is a core change, even when the motivating bug was seen through Hono.
- `@nizam-os/hono-ban` imports `@nizam-os/ban-core` by package name. In the repository the `source`
  export condition resolves that to the core's `src/` (see `packages/hono-ban/tsconfig.json` and its
  `vitest.config.ts`), so no build is needed for tests and type checks; the published package
  resolves to `dist/`.
- Tests that need Hono or its middleware (`@hono/*` validators, `OpenAPIHono`) live in
  `packages/hono-ban/src`; the core's tests feed the hooks validator results directly and drive the
  handler through `test-support/handler-dispatch.ts`.

## Conventions

- **End-to-end tests live in `e2e/ban/`.** That directory is a private pnpm workspace package that
  depends on `@nizam-os/ban-core` and `@nizam-os/hono-ban` through `workspace:*`, so its imports
  resolve through the published `exports` maps into each `dist/` and its `tsc` run checks the
  emitted declarations. Each `*.e2e.test.ts` file starts a real Hono app on `@hono/node-server` and
  asserts over `fetch` (`core-handler` serves a plain `fetch` function instead, to prove the core
  alone). Never import from `src/` there. Run one file with
  `pnpm --filter @nizam-os/ban-e2e exec vitest run <name>` after `pnpm build`.
- **Never throw inside the error handler.** See ADR 0002. The handler returns a `Response` on every
  path.

## Adding a format or adapter

The extension points live in `packages/ban-core/src`: wire formats (`formats/<name>/index.ts`,
exported as `@nizam-os/ban-core/formats/<name>`), validator hooks (`validation/<name>.ts`, exported
as `@nizam-os/ban-core/<name>`), observability sources (`observability/<name>.ts`, exported as
`@nizam-os/ban-core/<name>`), and database error mappers (`<database>/index.ts`, exported as
`@nizam-os/ban-core/<database>`; `@nizam-os/ban-core/postgresql` is the one so far). Each subpath is
mirrored by a one-line re-export in `packages/hono-ban/src` so it is also
`@nizam-os/hono-ban/<subpath>`. Formats are namespaced because several ship and a consumer picks
one; hooks, sources, and mappers are top-level because a consumer picks the one matching a library
already installed. A fifth kind, a host adapter, is its own package next to `@nizam-os/hono-ban`: it
depends on `@nizam-os/ban-core`, installs an `adopt` hook for the host's exceptions, and maps the
host's request to `ErrorRequest` (ADR 0016, ADR 0018).

**What is accepted in-tree.** Open a discussion first (the issue templates link to it) so the scope
question is settled before code exists.

- A format must implement a published specification with a stable URL (RFC 9457, JSON:API 1.1, and
  Google's AIP-193 are the precedents), or a vendor error shape that meets all of: publicly
  documented with a machine-readable schema, unchanged for years, and copied by unrelated APIs
  (Stripe's `api_errors` object is the one admitted so far; ADR 0014 records the test). `plain()` is
  the one deliberate exception to both. A shape that exists in one organization belongs in that
  organization as a `defineFormat()` call, which the README shows.
- A validator hook must target a validator with its own `@hono/*` middleware that Standard Schema
  does not already cover. `@nizam-os/ban-core/standard-schema` serves every Standard Schema library
  (ArkType, Effect Schema, Zod 4, Valibot), so a dedicated hook for one of them needs a reason the
  shared hook cannot meet.
- An observability module supplies a request id or trace id source for `HandlerOptions`. Sinks
  (loggers, error trackers) are not adapters: `onReport` hands them the report directly, and
  `docs/ban/DESIGN.md` section 4.6 rules out an adapter layer.
- A database error mapper keys on a documented, standardized error code space (Postgres SQLSTATE,
  Appendix A of its manual, is the precedent), never on message text, and produces constant
  client-facing text (ADR 0007, ADR 0015). It must recognize every mainstream driver's error shape
  structurally and unwrap the common ORM wrappers.

**Constraints every contribution inherits.**

- `@nizam-os/ban-core` has no dependencies and no peer dependencies, and `hono` stays
  `@nizam-os/hono-ban`'s only peer. Type the third-party objects you read structurally (`*Like`
  interfaces) and never import the library at runtime or in types (ADR 0009). The real library is a
  devDependency of the package whose tests need it and of `e2e/ban/package.json`; pnpm refuses
  versions younger than a day (`minimumReleaseAge`). A database mapper's real driver is an
  `e2e/ban/` devDependency (PGlite runs Postgres in-process and `@electric-sql/pglite-socket` serves
  it to real drivers over the wire protocol), and a driver whose error type spells its fields
  differently is a root devDependency for a type-level test only. The README's database-errors table
  and the matrix in ADR 0015 say how each driver is verified; moving a driver from fixtures to a
  live connection updates both.
- A format owns its JSON Schema as a literal, pins `status` and `code` with `constant()`, and
  documents `title` with `localizable()`, both from `schema-helpers.ts` (ADR 0003, ADR 0011, ADR
  0020). It renders from `ctx.meta`, which is already sanitized, and derives `type` at render time
  (ADR 0010). A format cannot set response headers; those stay with the error and the handler (SPEC
  6.9).
- A hook is `createHook(ban, extract)` from `validation/hook.ts` and throws `ban.validation()`; it
  never returns a `Response` (SPEC 8.4).

**Checklist.** Every item below is checked by CI or by a reviewer.

1. Source file in the location above, with a `@packageDocumentation` header naming the SPEC section
   it implements and `@ref` links to the specification or upstream source.
2. Entries in both `tsdown.config.ts` files (the key becomes the subpath): the core's points at the
   source, `@nizam-os/hono-ban`'s at a new one-line re-export file. Run `pnpm build` and commit the
   regenerated `exports` in both `package.json` files; CI fails on a diff. knip reads the tsdown
   entries, so `knip.jsonc` needs no change.
3. Unit tests beside the file. Formats also run `assertFormatConformance()` from `testing/` with the
   Ajv compiler in `test-support/ajv.ts` and must pass its mixed-items cases; hooks add a case to
   `packages/hono-ban/src/hooks.test-d.ts` proving assignability to the real middleware's hook type
   and a route to `validators.test.ts` there; mappers add a `*.test-d.ts` proving assignability to
   `BanOptions['map']` for bans with and without custom catalogs and to the real driver's error
   type.
4. `e2e/ban/package-surface.e2e.test.ts`: the exact export list of the new subpath. An e2e file
   named `<area>-<subject>.e2e.test.ts` driving the subpath over real HTTP.
5. `e2e/ban/smoke/app.ts` imports the subpath and `e2e/ban/smoke/checks.ts` exercises it; the smoke
   test must pass on Bun, Deno, and workerd (`pnpm test:runtimes`).
6. Docs in the same PR: `docs/ban/SPEC.md` sections 1 (subpath table and source layout), 12 (entry
   list), 14 and 14.1 (test rows), plus the section for the new module (6.x, 7.x, 8.x, or 10.x);
   `docs/ban/DESIGN.md` section 4.4, 4.5, 4.7, or 4.6, and 4.10; the Modules table in both package
   READMEs and any sentence that enumerates the formats or hooks; `package.json` `keywords` when a
   new library name applies.
7. An ADR: a new subpath is a public API change, and a new format is a wire format.
8. A changeset: an additive subpath or option is `minor`; anything that changes an existing wire
   shape, schema, or exported type is `major`.
