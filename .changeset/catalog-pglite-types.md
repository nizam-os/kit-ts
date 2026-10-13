---
'@nizam-os/pg-catalog': minor
---

The Kysely types can follow PGlite's own parsers, for applications on Kysely's `PGliteDialect`: set
`types.driver: 'pglite'` (the default stays `'node-postgres'`). `int8` reads as `number | bigint`,
`bytea` as `Uint8Array`, `interval`, `point`, and `circle` as text, every array as an array, and
`json` and `jsonb` take any JSON value through the new `JsonParameter` helper. A domain over a date
or time type, `bytea`, JSON, or an array takes PostgreSQL's text, since PGlite sends a domain's
value with `toString()`. `JsonParameter` is now a reserved name under either driver.
