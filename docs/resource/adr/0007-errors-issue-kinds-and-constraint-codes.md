# ADR 0007: Schema issues are named by JSON Schema keywords; constraint violations carry the constraint's code

- Status: accepted
- Date: 2026-10-10

## Context

Two layers reject a write. The request schemas reject it before the database is touched, and the
database rejects what the schemas could not see: a duplicate, a missing related row, a CHECK
spanning columns a `PATCH` left out. Clients need to tell problems apart by a stable code, land each
one on the right form field, and show it in the viewer's language.

JSON:API 1.1 fixes some statuses: 404 MUST when a request references a related resource that does
not exist, 409 MUST for a client-generated id that already exists, 409 MAY for a uniqueness
violation on update, 403 MUST for an unsupported request to update a resource, and 403 MAY for an
unsupported request to create one. Its examples report an invalid attribute as 422 with
`source.pointer`. `@nizam-os/ban-core` fixes `code` and `title` per catalog entry (ban ADR 0011),
reports validator issues as `VALIDATION_FAILED` (422) with one item per issue whose `reason`,
`expected`, and `received` the JSON:API format renders under `meta`, maps PostgreSQL errors through
`postgresMapper` by constraint name or `table.column`, and makes the handler's `transform` the
localization point (ban SPEC 6.2). Zod's issue codes changed between Zod 3 and Zod 4.

@ref https://jsonapi.org/format/1.1/#crud-creating-responses @ref
https://jsonapi.org/format/1.1/#crud-updating-responses @ref
https://jsonapi.org/examples/#error-objects @ref
https://json-schema.org/draft/2020-12/json-schema-validation

## Decision

- **Schema issues** are `VALIDATION_FAILED` (422), one item per issue, with a pointer to the member.
  The item's `reason` is an issue kind from a closed vocabulary named after the JSON Schema
  validation keywords (`required`, `type`, `format`, `minLength`, `maxLength`, `minimum`, `maximum`,
  `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `enum`, `pattern`, `additionalProperties`),
  and its `expected` is the keyword's value as text. An issue raised by a validator, the twin of a
  CHECK the recognizer could not translate, carries that constraint's code as its kind. The
  vocabulary is resource-core's, so a Zod release cannot rename it.
- **A member the operation does not accept** (read-only on create or update, immutable on update) is
  `FORBIDDEN` (403) with a pointer to it, as JSON:API requires for updates and allows for creates.
- **Constraint violations** reported by the database carry the constraint's code (ADR 0003): CHECK
  and NOT NULL as 422 "Invalid Attribute", UNIQUE, PRIMARY KEY, and EXCLUDE as 409 "Conflict",
  FOREIGN KEY on a write of the referencing resource as 404 "Related Resource Not Found", each with
  one item per public field or relationship of the constraint. A FOREIGN KEY violated by removing a
  referenced row is the built-in `CONFLICT` (409): the code belongs to the referencing table, which
  may not be a declared resource, and an application that wants a specific code checks references in
  a `remove` rule (SPEC 12.4).
- **The codes form a catalog fragment** that an application spreads into `createBan({ errors })`
  next to `@nizam-os/jsonapi-core`'s `ERROR_CATALOG`. They are produced inside the operation, where
  the operation and the pointer base are known: `constraintError` recognizes the driver error with
  `@nizam-os/ban-core/postgresql`'s `findPostgresError` and `readPostgresFields`, and anything it
  does not own falls through to the ban's `map`, typically `postgresMapper()` for the SQLSTATE
  table. A global mapper sees neither which operation failed nor where its document starts.
- **Localization** is a `transform` that replaces titles and details by code and item details by
  kind; codes, statuses, and pointers never change.

## Consequences

Clients switch on codes and localize generically: a `maxLength` message with its limit covers every
length rule of every resource, and one sentence per constraint kind covers every derived code unless
a locale overrides that code, so a locale does not grow with the schema. The same rule can surface
under two codes, `VALIDATION_FAILED` with `maxLength` from the schema and the constraint's code from
the database; the second only appears when a writer bypassed the schema, which is itself worth
seeing in a report.

One sibling changes with this family: `@nizam-os/jsonapi-core` keeps an issue's `code` and
`expected` as the item's `reason` and `expected` when they are strings (ban-core's `ValidationIssue`
members), an additive change (SPEC 9.3).

Item pointers are built from a base the caller passes, `/data` for a single request and the
operation's own `data` (`/atomic:operations/2/data`) inside Atomic Operations, because
`@nizam-os/jsonapi-core`'s operation processor keeps an item's pointer when it has one.
