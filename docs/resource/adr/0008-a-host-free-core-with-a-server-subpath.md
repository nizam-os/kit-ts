# ADR 0008: A host-free core with a server subpath and a storage contract

- Status: accepted
- Date: 2026-10-10

## Context

Declarations are imported by browsers (forms, the typed client) and by servers. Server behavior,
such as policies, quotas, effects, and binding a scope to the session, must never reach a browser
bundle, and storage needs a query builder, which a core must not import, not even its types (root
`AGENTS.md`). The family's other packages each need a different slice: `@nizam-os/kysely-resource`
runs the operations, `@nizam-os/hono-resource` serves them over HTTP, `@nizam-os/jsonapi-client` and
`@nizam-os/react-resource` call them.

Zod 4.5.0 (2026-08-28) made `.min()`, `.max()`, and `.length()` count Unicode code points instead of
UTF-16 units, as PostgreSQL's `char_length` and `varchar(n)` do, and made `z.iso.datetime()` require
seconds, as RFC 3339 does; 4.4.3 counts units (checked with the released packages).

@ref https://github.com/colinhacks/zod/releases/tag/v4.5.0 @ref
https://github.com/colinhacks/zod/pull/6441

## Decision

- `@nizam-os/resource-core` (root) holds declarations, names, wire forms, schemas, the public facets
  of codecs and validators, the error catalog, messages, and localization. It runs in browsers.
- `@nizam-os/resource-core/server` holds the domain definers, policies, behavior, scopes, quotas,
  events, `reject`, and the storage adapter contract. It imports no database code; adapters
  implement the contract.
- `@nizam-os/resource-core/openapi` builds the OpenAPI 3.1 document and the API diff, so the root
  stays small for browsers.
- `@nizam-os/resource-core/testing` holds the storage contract suite, as framework-free cases an
  adapter package runs under its own test runner, and the fixture generators the oracle uses.
- Dependencies: `@nizam-os/catalog-core` (types), `@nizam-os/jsonapi-core`, `@nizam-os/keyset-core`,
  and `@nizam-os/ban-core`. `zod` is a peer dependency with the range `^4.5.0`, pinned by a test of
  the length unit and by a CI job at the floor.

## Consequences

A browser bundle that imports a declaration pulls in Zod and the derived schemas, never server code.
A second storage adapter (Drizzle, a different driver) is a package that passes the contract suite.
The Zod floor excludes applications on Zod 4.4 and earlier, which would otherwise accept or reject
strings by a different length than the database.
