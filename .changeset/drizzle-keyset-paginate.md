---
'@nizam-os/drizzle-keyset': minor
---

`createDefineKeyset(schema, defaults?)` over the application's Drizzle schema object: a definition
names tables by their keys and columns by their properties, checked in the types and again when it
is defined, where a field over a column without `.notNull()` must be declared `nullable: true`. Its
keysets carry `paginate(db, request, options?)`, which builds the select over the definition's table
with the caller's `select` and `where`, adds the filter, the seek, the key selections, the order,
and the limit, and runs it on any Drizzle PostgreSQL database or transaction, with `total`,
`onQuery`, and `context` as in @nizam-os/kysely-keyset. The cursors are that binding's: a keyset of
either with the same fields, sort, and secret reads the other's.
