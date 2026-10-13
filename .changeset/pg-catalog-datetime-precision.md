---
'@nizam-os/pg-catalog': patch
'@nizam-os/catalog-core': patch
---

Record the precision of `timestamp(p)`, `timestamptz(p)`, `time(p)`, and `timetz(p)` columns and
domains in `precision`. PostgreSQL rounds a value to that many fraction digits of a second, so a
consumer that checks values before they reach the database needs it:
`'9999-12-31 23:59:59.999999'::timestamp(3)` stores `10000-01-01 00:00:00`. Catalogs extracted
before this change carry `null` there and need `pg-catalog extract` again.
