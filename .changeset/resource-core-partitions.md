---
'@nizam-os/resource-core': minor
---

Violations raised through a partitioned table now map to the declared codes of that table.
PostgreSQL names the partition that stores the row, and for a primary key, UNIQUE, or EXCLUDE
violation the partition's own index, so these violations used to fall through to the generic
mapping. Partitions are often created after the migrations ran, so the database resolves them
instead of the catalog:

- `partitionViolation(thrown, { resource, operation })` returns the names an integrity violation
  carries when they are not the resource's table.
- `StorageAdapter.partitionRoot(names)` is a new adapter method: it answers with the partitioned
  table at the top of the partition's tree and that table's name for the constraint, and `undefined`
  for a table that is not a partition. `PARTITION_ROOT_SQL` is the query that answers it, and the
  storage contract checks it as obligation 11 on a two-level partition in another schema.
- `constraintError` takes the answer as the `partition` option. The new `ViolationNames` type
  describes both.
