---
'@nizam-os/catalog-core': minor
'@nizam-os/pg-catalog': minor
---

`toCamelCase` and `toSnakeCase`, Kysely's `CamelCasePlugin` conversions with its options, move from
`@nizam-os/pg-catalog` into `@nizam-os/catalog-core`, together with the `CamelCaseOptions` type, so
the `camelCase` Kysely types and the public names of `@nizam-os/resource-core` come from one
implementation. `@nizam-os/pg-catalog` re-exports them with the rest of the core; its `camelCase`
keys do not change.
