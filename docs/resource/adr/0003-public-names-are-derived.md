# ADR 0003: Public names are derived; `as` and `code` are the only overrides

- Status: accepted
- Date: 2026-10-10

## Context

Hand-chosen public names drift between layers: a column `created_at` becomes the attribute
`createdAt`, the filter `created`, the sort key `creation`, and the error `CREATED_AT_INVALID`, each
chosen by a different person on a different day. Clients pay for every inconsistency, and a rename
in one layer silently breaks another.

JSON:API 1.1 constrains member names (letters, digits, and U+0080 and above anywhere; `-`, `_`, and
space only in the middle), requires type values to follow the same rules, puts a resource's fields
in one namespace with `type` and `id`, and recommends that keys referencing related resources
(`author_id`) appear as relationships rather than attributes. Many applications already map
snake_case columns to camelCase keys with Kysely's `CamelCasePlugin`, and `@nizam-os/pg-catalog`
renders its `camelCase` Kysely types with a tested port of that conversion. PostgreSQL 18 names a
column's NOT NULL constraint `<table>_<column>_not_null`, though a 23502 error still carries no
constraint name on any supported major (checked on 14.19 and 18.3).

@ref https://jsonapi.org/format/1.1/#document-member-names @ref
https://jsonapi.org/format/1.1/#document-resource-object-fields @ref
https://jsonapi.org/format/1.1/#document-resource-object-attributes @ref
https://kysely.dev/docs/plugins#camel-case-plugin

## Decision

- The resource type is the table's name, without its schema. A field is the column name converted by
  CamelCasePlugin's `camelCase` with default options: `_` characters are dropped and the character
  after each is upper-cased (`created_at` is `createdAt`). A relationship is the foreign-key column
  without its `_id` suffix, converted the same way (`owner_id` is `owner`). An error code is the
  constraint name upper-cased with `String.prototype.toUpperCase`; the code of a column's NOT NULL
  rule comes from PostgreSQL 18's name for it, `<table>_<column>_not_null`.
- The conversion has one implementation, shared with `@nizam-os/pg-catalog`'s `camelCase` Kysely
  types and moved to `@nizam-os/catalog-core` for that purpose, plus a type-level twin in
  `@nizam-os/resource-core`; one table of cases pins both.
- `as` renames a type, a field, or a relationship; `code` renames an error code. No other option
  takes a public name, so nothing else can introduce one.
- Every derived or overridden name is checked: types, fields, and relationships are JSON:API member
  names, fields and relationships share one namespace that excludes `id` and `type`, types are
  unique in a registry, and codes match `^[A-Z][A-Z0-9_]*$` and are unique across the registry, the
  application's own codes, and `@nizam-os/jsonapi-core`'s. A name that fails, such as a column called
  `type` or a foreign key not ending in `_id`, needs `as` or `code`. TypeScript reports what it can
  see; the rest throws `TypeError` naming the option path.
- A foreign-key column is exposed only as a relationship, never as an attribute.
- The derived public surface of each resource (names, codes, requiredness, enum values, operators)
  is snapshotted, and the API diff in CI shows every change to it, overrides included.

## Consequences

Renaming a column renames its public field. The API diff makes that visible in the pull request of
the migration; adding `as` with the old name in the same pull request keeps the contract.

Public names inherit the database's naming discipline, so a constraint named `chk1` produces the
code `CHK1` until someone names the constraint or adds `code`. Types are table names such as
`contact_phones`, which JSON:API allows; `as` gives `contactPhones` where an application prefers it.
