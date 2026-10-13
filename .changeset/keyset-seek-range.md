---
'@nizam-os/keyset-core': minor
'@nizam-os/kysely-keyset': minor
---

A page deep in a list now costs one page: the seek leads with a range on the first sort key, so an
index on the sort starts its scan at the cursor instead of filtering every entry before it.

- Over two or more keys the seek is `range and (the disjunction)`: after a value, `k >= v` (`<=`
  descending) on a field that is not nullable; after a null, `k is null`; before a value, `k <= v`
  (`>=` descending). The rows a page holds do not change.
- Keys that are not nullable are ordered without `nulls last` or `nulls first`, so PostgreSQL's
  default applies and an index declared in the sort's directions serves the order; `PlanKey.nulls`
  is `null` for them, and `PlanKey.nullable` carries the declaration. Adapters that render a plan
  must emit no placement when `nulls` is `null`.
- `nullable` is trusted: `finishPage` throws a `TypeError` for a null sort value on a field declared
  not nullable, and `createDefineKeyset<DB>()` requires `nullable: true` for a column whose type
  includes `null`.
