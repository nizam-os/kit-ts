---
'@nizam-os/resource-core': minor
---

`declareResource` checks each member's `filter` and `sort` against `@nizam-os/keyset-core`'s operator
table, in types and at runtime: the operators must be ones the member's keyset type takes, `isNull`
needs a column that can be null, `json`, `jsonb`, and codec fields neither filter nor sort, and an
array does not sort. A text column with a CHECK `IN (...)` filters as an enum. Each mistake fails
`tsc` at the member and throws `TypeError` naming it, such as
`contacts.fields.tags.filter: operator "gt" is not available for array fields`, so a filter a
declaration allows is one the list planner can run. Declarations that filter a type with an operator
it lacks no longer compile.
