---
'@nizam-os/pg-catalog': patch
---

A foreign key that references a partitioned table is listed once. PostgreSQL also adds one clone of
it per partition of the referenced table, named differently on each major; the catalog now leaves
these out, as pg_dump does, so the same migrations give the same files on PostgreSQL 14 to 18.
