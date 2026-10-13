---
'@nizam-os/resource-core': patch
---

The oracle behind `pg-catalog rules --check` reads the elements of a `boolean[]` column as
PostgreSQL prints them, `t` and `f`, instead of reading every element as `false` and reporting a
disagreement the database never had; a text that is no boolean is now unrepresentable. The storage
contract's `tasks` gains a `boolean[]` column, so the contract suite fails an adapter that misreads
one.
