---
'@nizam-os/catalog-core': minor
'@nizam-os/pg-catalog': minor
---

The public catalog lists each unique index that no constraint backs among its table's constraints,
as a unique constraint keyed by the index name, since PostgreSQL reports a violated unique index
under that name exactly as it reports a UNIQUE constraint. Every public unique constraint gains
`partial`, true when a `WHERE` clause limits the rule to some rows; the predicate itself stays
private. A unique index over an expression stays out, and so does one named like a CHECK or FOREIGN
KEY constraint of its table, which keeps the key. `CATALOG_FORMAT` is now 2, so committed catalogs
need `pg-catalog extract` again.
