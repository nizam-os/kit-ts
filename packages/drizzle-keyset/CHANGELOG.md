# @nizam-os/drizzle-keyset

## 0.1.0

### Minor Changes

- [#147](https://github.com/nizam-os/kit-ts/pull/147) [`4e95259`](https://github.com/nizam-os/kit-ts/commit/4e95259abe482b4dffc20642be88ec2bbb22a2f0) Thanks [@ali-issa](https://github.com/ali-issa)! - `createDefineKeyset(schema, defaults?)` over the application's Drizzle schema object: a definition
  names tables by their keys and columns by their properties, checked in the types and again when it
  is defined, where a field over a column without `.notNull()` must be declared `nullable: true`. Its
  keysets carry `paginate(db, request, options?)`, which builds the select over the definition's table
  with the caller's `select` and `where`, adds the filter, the seek, the key selections, the order,
  and the limit, and runs it on any Drizzle PostgreSQL database or transaction, with `total`,
  `onQuery`, and `context` as in @nizam-os/kysely-keyset. The cursors are that binding's: a keyset of
  either with the same fields, sort, and secret reads the other's.

- [#147](https://github.com/nizam-os/kit-ts/pull/147) [`61ee711`](https://github.com/nizam-os/kit-ts/commit/61ee7112c7de0893ecf649ab95636f8679639c58) Thanks [@ali-issa](https://github.com/ali-issa)! - New package: keyset pagination for Drizzle ORM on PostgreSQL, starting with the render functions.
  `renderTarget` and `renderPredicate` turn the targets and predicates of @nizam-os/keyset-core's
  query plan into Drizzle `sql` over the application's own schema objects, so the database's `casing`
  and `pgSchema` tables print as in its other queries. Every value is a bound parameter, an array one
  parameter of its own; every column reference is its own nested `sql` chunk, so a correlated
  aggregate keeps its tables wherever it is selected. Everything @nizam-os/keyset-core exports is
  re-exported.

- [#159](https://github.com/nizam-os/kit-ts/pull/159) [`fee2388`](https://github.com/nizam-os/kit-ts/commit/fee2388e2800091b3a91265a16d91371b65e10ec) Thanks [@ali-issa](https://github.com/ali-issa)! - A page inside a tie of the first sort key, or after a value of a nullable first key, now reads about
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

### Patch Changes

- [#147](https://github.com/nizam-os/kit-ts/pull/147) [`dde817e`](https://github.com/nizam-os/kit-ts/commit/dde817e95ebe834cf7580b00416d02a7ddd4ff26) Thanks [@ali-issa](https://github.com/ali-issa)! - A page reassigned in a loop, `page = await keyset.paginate(db, { page: { after: page.next } })`,
  keeps its row type: `paginate` infers its selection from `options.select` only, never from the
  variable the page is assigned to, so the default stays the table's row.
- Updated dependencies [[`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`e5a4317`](https://github.com/nizam-os/kit-ts/commit/e5a43172be2e8ed4c35168b26ebfecff4efece60), [`2485317`](https://github.com/nizam-os/kit-ts/commit/2485317ff47933f84f7c41557700dd4b9d358461), [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6), [`fee2388`](https://github.com/nizam-os/kit-ts/commit/fee2388e2800091b3a91265a16d91371b65e10ec), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989)]:
  - @nizam-os/keyset-core@0.1.0
