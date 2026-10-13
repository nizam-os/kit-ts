---
'@nizam-os/drizzle-keyset': minor
---

New package: keyset pagination for Drizzle ORM on PostgreSQL, starting with the render functions.
`renderTarget` and `renderPredicate` turn the targets and predicates of @nizam-os/keyset-core's
query plan into Drizzle `sql` over the application's own schema objects, so the database's `casing`
and `pgSchema` tables print as in its other queries. Every value is a bound parameter, an array one
parameter of its own; every column reference is its own nested `sql` chunk, so a correlated
aggregate keeps its tables wherever it is selected. Everything @nizam-os/keyset-core exports is
re-exported.
