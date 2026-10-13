# Nizam Kit

TypeScript libraries for HTTP APIs and the applications built on them, published under the
`@nizam-os` scope. Each family is a framework-free core plus bindings for a host (Hono, Kysely),
written from the specification or the manual it implements: every rule is cited where it is
implemented and pinned by a test, and every choice the specification leaves open is written down.

| Family                    | Package                                                                      | What it is                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ban](docs/ban)           | [`@nizam-os/ban-core`](packages/ban-core#readme)                             | Structured HTTP errors: one typed catalog, one handler that turns anything thrown into a well-formed response, and pluggable wire formats (RFC 9457 Problem Details, JSON:API, Google AIP-193, Stripe, yours).                                                                                              |
|                           | [`@nizam-os/hono-ban`](packages/hono-ban#readme)                             | The [Hono](https://hono.dev) binding: `app.onError()` wiring and `HTTPException` adoption, every core subpath re-exported.                                                                                                                                                                                  |
| [catalog](docs/catalog)   | [`@nizam-os/catalog-core`](packages/catalog-core#readme)                     | The PostgreSQL catalog model as TypeScript types: tables, columns, constraints, indexes, row security, enums, and domains, with the browser-safe slice (`toPublicCatalog`) and a structural diff (`diffCatalogs`).                                                                                          |
|                           | [`@nizam-os/pg-catalog`](packages/pg-catalog#readme)                         | The extractor: replays your SQL migrations into PGlite or a throwaway database on a server, reads `pg_catalog`, and writes the catalog as a deterministic `as const` module, checked current in CI.                                                                                                         |
| [intl](docs/intl)         | [`@nizam-os/intl-core`](packages/intl-core#readme)                           | Formatters that read the locale and the reader's time zone on every call, through cached `Intl` objects built for formatting tags that name their calendar and digits, so a server render and its hydration agree; the reader's time zone from a cookie; Unicode bidi isolation. In development.            |
|                           | [`@nizam-os/paraglide-intl`](packages/paraglide-intl#readme)                 | The [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) compile step, run once or on every change, with every interpolated value isolated and every message that formats a value refused. In development.                                                                              |
| [jsonapi](docs/jsonapi)   | [`@nizam-os/jsonapi-core`](packages/jsonapi-core#readme)                     | [JSON:API 1.1](https://jsonapi.org/format/1.1/): resource definitions, documents, query parsing, request validation, content negotiation, the Cursor Pagination profile, the Atomic Operations extension.                                                                                                   |
|                           | [`@nizam-os/hono-jsonapi`](packages/hono-jsonapi#readme)                     | The Hono binding: negotiation middleware, validators typed for `c.req.valid()`, response helpers, error handlers on `@nizam-os/hono-ban`, the operations endpoint.                                                                                                                                          |
|                           | [`@nizam-os/jsonapi-client`](packages/jsonapi-client#readme)                 | A typed client for those servers: calls, queries, and records typed by the definitions the server is built from, with nothing generated; runs wherever `fetch` does.                                                                                                                                        |
|                           | [`@nizam-os/tanstack-query-jsonapi`](packages/tanstack-query-jsonapi#readme) | [TanStack Query](https://tanstack.com/query/v5) options for those clients' calls, which every adapter takes: reads keyed by the request each sends, infinite lists by the server's links, and writes that stay pending until what they changed has refetched. In development.                               |
| [keyset](docs/keyset)     | [`@nizam-os/keyset-core`](packages/keyset-core#readme)                       | Keyset pagination: a definition of what a collection can sort, filter, and search on, a planner, HMAC-signed cursors bound to the request, page assembly with `prev` and `next`.                                                                                                                            |
|                           | [`@nizam-os/kysely-keyset`](packages/kysely-keyset#readme)                   | The [Kysely](https://kysely.dev) binding for PostgreSQL: a definer checked against your `DB` interface and `paginate` rendered onto your own select query.                                                                                                                                                  |
|                           | [`@nizam-os/drizzle-keyset`](packages/drizzle-keyset#readme)                 | The [Drizzle](https://orm.drizzle.team) binding for PostgreSQL: a definer checked against your Drizzle schema, in the types and at startup, and `paginate` building the select over your table.                                                                                                             |
| [resource](docs/resource) | [`@nizam-os/resource-core`](packages/resource-core#readme)                   | One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog, so a wrong name fails `tsc` at the option that holds it. In development: names, schemas, error codes, messages, and OpenAPI follow.                                                                      |
|                           | [`@nizam-os/kysely-resource`](packages/kysely-resource#readme)               | The Kysely runtime on PostgreSQL: every operation in one transaction scoped to the actor's tenant, for row security policies and its own scope predicate alike. In development.                                                                                                                             |
|                           | [`@nizam-os/hono-resource`](packages/hono-resource#readme)                   | The Hono routes: every operation a runtime runs, each relationship's links, the Atomic Operations endpoint, and the OpenAPI document, served where the declarations' links point, with JSON:API negotiation, validation, includes, localized errors, and the request's actor resolved once. In development. |
|                           | [`@nizam-os/resource-ui`](packages/resource-ui#readme)                       | Forms and lists from those declarations, for any framework: labels and options from your messages, validation in the server's words, the write a form sends, refusals on their fields, and list state as TanStack Table v9 holds it. In development.                                                        |
|                           | [`@nizam-os/tanstack-form-resource`](packages/tanstack-form-resource#readme) | [TanStack Form](https://tanstack.com/form/v1) options for those forms, which every adapter takes, and a refused write's texts on their fields. In development.                                                                                                                                              |

Every package is ESM only and runs on Node 22.12+, Bun, and Deno. Every package but
`@nizam-os/pg-catalog`, a build-time tool that reads files and drives PostgreSQL, and
`@nizam-os/paraglide-intl`, a build-time tool that compiles messages, also runs on Cloudflare
Workers and reads nothing from the environment. The cores have no dependencies apart from each other
(`@nizam-os/jsonapi-core` is built on `@nizam-os/ban-core`, and `@nizam-os/resource-core` on the
catalog, jsonapi, and keyset cores). `@nizam-os/jsonapi-client` depends on `@nizam-os/jsonapi-core`
alone and also runs in browsers, as do `@nizam-os/intl-core`, `@nizam-os/resource-ui`,
`@nizam-os/tanstack-query-jsonapi`, and `@nizam-os/tanstack-form-resource`. A binding takes its host
as a peer dependency, and also each `@nizam-os` package whose values the application hands it
([ADR 0006](docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)):
`@nizam-os/hono-jsonapi` takes `@nizam-os/hono-ban`, `@nizam-os/kysely-resource` takes
`@nizam-os/resource-core` and `@nizam-os/keyset-core`, `@nizam-os/hono-resource` takes
`@nizam-os/hono-jsonapi` and `@nizam-os/resource-core`, `@nizam-os/resource-ui` takes
`@nizam-os/resource-core` and `@nizam-os/jsonapi-client`. `@nizam-os/tanstack-query-jsonapi` takes
`@nizam-os/jsonapi-client`, and `@nizam-os/tanstack-form-resource` takes `@nizam-os/resource-ui`,
each with the TanStack core it binds, `@tanstack/query-core` or `@tanstack/form-core`, as an
optional peer that the application's adapter brings
([ADR 0011](docs/adr/0011-a-binding-takes-the-core-an-adapter-brings-as-an-optional-peer.md)).
`@nizam-os/pg-catalog` depends on `pg` and takes PGlite and `@nizam-os/resource-core` as optional
peers. `@nizam-os/paraglide-intl` takes `@inlang/paraglide-js` and loads projects with the inlang
SDK that Paraglide itself depends on
([ADR 0009](docs/adr/0009-a-binding-makes-what-it-hands-its-host-with-the-hosts-own-dependency.md)).
A peer range on a package outside the workspace starts past that package's published advisories, so
an affected release in your application is an unmet peer dependency, and CI runs the binding's tests
on the range's floor
([ADR 0007](docs/adr/0007-a-peer-range-starts-past-published-advisories-and-ci-tests-its-floor.md)).

## Install

```bash
pnpm add @nizam-os/hono-ban hono                                # errors on Hono
pnpm add @nizam-os/hono-jsonapi hono @nizam-os/hono-ban          # JSON:API on Hono
pnpm add @nizam-os/jsonapi-client                               # a typed client of a JSON:API server
pnpm add @nizam-os/tanstack-query-jsonapi @tanstack/react-query # its calls as TanStack Query options, any adapter
pnpm add @nizam-os/kysely-keyset kysely                         # keyset pagination on Kysely
pnpm add @nizam-os/drizzle-keyset drizzle-orm                   # keyset pagination on Drizzle
pnpm add -D @nizam-os/pg-catalog @electric-sql/pglite           # your PostgreSQL schema as a typed catalog
pnpm add @nizam-os/resource-core                                # resources declared over that catalog
pnpm add @nizam-os/kysely-resource @nizam-os/keyset-core kysely  # those resources run on PostgreSQL through Kysely
pnpm add @nizam-os/hono-resource @nizam-os/hono-jsonapi hono     # and served on Hono
pnpm add @nizam-os/resource-ui @nizam-os/jsonapi-client          # and their forms and lists, in any framework
pnpm add @nizam-os/tanstack-form-resource @tanstack/react-form  # bound to TanStack Form, any adapter
pnpm add @nizam-os/intl-core                                    # formatting and time zones for Paraglide apps
pnpm add -D @nizam-os/paraglide-intl @inlang/paraglide-js       # Paraglide's compile, values isolated
pnpm add @nizam-os/ban-core                                     # a core on its own: a fetch handler, a worker, another framework
```

## Naming

Package names are predictable, in the manner of `@tanstack/*`:

| Shape                       | Meaning                                            | Examples                                                                |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `@nizam-os/<thing>-core`    | the framework-free, database-free core of a family | `@nizam-os/ban-core`, `@nizam-os/catalog-core`, `@nizam-os/keyset-core` |
| `@nizam-os/<host>-<thing>`  | the binding of a family to a host library          | `@nizam-os/hono-ban`, `@nizam-os/kysely-keyset`, `@nizam-os/pg-catalog` |
| `@nizam-os/<thing>-<facet>` | a companion of a family that binds to no host      | `@nizam-os/jsonapi-client`                                              |

`<thing>` is the family name (`ban`, `catalog`, `intl`, `jsonapi`, `keyset`), `<host>` the npm name
of the host library (`hono`, `kysely`, `pg`, `drizzle`, `react`, `paraglide`), or the library's own
name where it is published as a framework-free core plus framework adapters (`tanstack-query`,
`tanstack-form`,
[ADR 0010](docs/adr/0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)). The
directory under `packages/` is the package name without the scope.
[ADR 0003](docs/adr/0003-package-naming.md) records the rule; new packages are tracked as epics in
the [issues](https://github.com/nizam-os/kit/issues?q=is%3Aissue+label%3Aepic).

## Repository

A pnpm workspace ([ADR 0002](docs/adr/0002-one-repository-for-every-package.md)):

- `packages/<name>`: one directory per published package
- `e2e/<family>`: a private package per family that consumes the built packages over real HTTP or a
  real database, plus the Bun, Deno, and workerd smoke test
- `docs/<family>`: the family's `README.md`, `DESIGN.md` (intent), `SPEC.md` (the normative
  contract), `adr/` (decisions), `CONTRIBUTING.md` and `AGENTS.md` (family-specific rules)
- `docs/adr`: decisions about the repository itself

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the quality gates, and releases;
[`SECURITY.md`](SECURITY.md) how to report a vulnerability.

## License

[MIT](LICENSE)
