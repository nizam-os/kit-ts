---
'@nizam-os/keyset-core': minor
'@nizam-os/kysely-keyset': minor
'@nizam-os/drizzle-keyset': minor
'@nizam-os/kysely-resource': patch
---

A page inside a tie of the first sort key, or after a value of a nullable first key, now reads about
a page per seek branch instead of every index entry before its cursor: a seek of two or more
branches runs as one select per branch, joined with `union all`.

- `QueryPlan.seek` is a list of branches: none on a first page, one or more after a cursor. Each
  branch is a conjunction an index on the sort bounds at the cursor, equality on the earlier keys
  and a bound on one key; after a value of a nullable key, its nulls are a branch of their own. With
  both cursors, each branch of `after` also holds the predicate for `before`. When the first key is
  an aggregate, the seek is one branch, `seekPredicate`.
- `PlanKey.valueAlias` (`keyset0v`, `keyset1v`, ...) is the alias a union selects each key's value
  under, uncast, to order the union by. An adapter that renders a plan adds a single branch with
  `where`, and runs two or more as one select each under `union all`, ordered by the value aliases
  and limited again.
- The Kysely and Drizzle bindings reserve the value aliases as they reserve `keyset0`, `keyset1`,
  ...: a Drizzle `select` member named like one throws a `TypeError`, and both bindings strip them
  from the rows. The rows, their order, and the cursors do not change.
- `@nizam-os/kysely-resource` runs its list statement the same way.
