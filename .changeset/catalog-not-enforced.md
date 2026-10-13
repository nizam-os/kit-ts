---
'@nizam-os/catalog-core': minor
'@nizam-os/pg-catalog': minor
---

A public CHECK or foreign key keeps `enforced`, false when the constraint is NOT ENFORCED
(PostgreSQL 18), which the database records but never checks. A consumer can then skip what no
client can violate instead of mistaking it for an enforced constraint. `CATALOG_FORMAT` is now 3, so
committed catalogs need `pg-catalog extract` again.
