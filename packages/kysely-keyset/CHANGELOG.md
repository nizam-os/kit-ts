# @nizam-os/kysely-keyset

## 0.1.0

### Minor Changes

- [#66](https://github.com/nizam-os/kit-ts/pull/66) [`e5a4317`](https://github.com/nizam-os/kit-ts/commit/e5a43172be2e8ed4c35168b26ebfecff4efece60) Thanks [@ali-issa](https://github.com/ali-issa)! - Cursors can be bound to a context the server supplies, such as the tenant a query is scoped to.
  
  - `plan(request, { context })` in `@nizam-os/keyset-core` and
    `paginate(query, request, { context })` in `@nizam-os/kysely-keyset` take named strings, numbers,
    bigints, booleans, or `null`. A cursor issued under one context is rejected under another, or
    under none, with `InvalidCursorError` (reason `context`) before any query runs.
  - Requests without a context bind exactly as before, so existing cursors keep working and the cursor
    format version stays 1.

- [#65](https://github.com/nizam-os/kit-ts/pull/65) [`2485317`](https://github.com/nizam-os/kit-ts/commit/2485317ff47933f84f7c41557700dd4b9d358461) Thanks [@ali-issa](https://github.com/ali-issa)! - `createDefineKeyset(defaults)` sets the cursor options, the page bounds, and the text-search
  configuration once for every keyset an application defines.
  
  - `@nizam-os/keyset-core` gains `createDefineKeyset(defaults)`. It returns a `defineKeyset` that
    merges `defaults.cursor` and `defaults.page` under each definition option by option, and gives a
    full-text search that names no configuration `defaults.search.config`. The defaults are validated
    when the definer is created, and every definition must still end up with a cursor secret.
  - `@nizam-os/kysely-keyset`'s `createDefineKeyset<DB>(defaults)` takes the same defaults and keeps
    every compile-time name check. With a cursor default, `cursor` becomes optional in a definition.

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

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989) Thanks [@ali-issa](https://github.com/ali-issa)! - A page deep in a list now costs one page: the seek leads with a range on the first sort key, so an
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

- First release: keyset pagination for Kysely on PostgreSQL.
  
  - `createDefineKeyset<DB>()` returns a `defineKeyset` that checks every table, column, relation, and
    search name of a definition against the application's Kysely `DB` interface and whose keysets
    carry `paginate`.
  - `paginate(query, request, options)` plans the request with @nizam-os/keyset-core, renders the
    filter, seek, key selections, ordering, and limit onto the caller's own select query, runs it, and
    returns the page with the caller's rows untouched. `total: true` runs the count query; `onQuery`
    reports each statement with its SQL, parameters, and timing.
  - Column references are `table.column`, so a `CamelCasePlugin` maps them like the application's own
    queries; aggregates are correlated scalar subqueries; relation filters are `exists`; search is
    `ILIKE` over `concat_ws` or `tsvector @@ tsquery`.
  - Everything @nizam-os/keyset-core exports is re-exported, so an application imports from one
    package.

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`8194261`](https://github.com/nizam-os/kit-ts/commit/81942616668548d4c7c7dae915055b85833c82e3) Thanks [@ali-issa](https://github.com/ali-issa)! - Requires `kysely` 0.28.17 or later, the first release past Kysely's published SQL injection
  advisories (GHSA-wmrf-hv6w-mr66, GHSA-fr9j-6mvq-frcv, GHSA-8cpq-38p9-67gx, GHSA-pv5w-4p9q-p3v2).
  None of them reaches the queries the adapter builds, but the adapter runs on the application's own
  copy of Kysely, so its peer range no longer admits an affected release. An application on an earlier
  0.28 release upgrades within 0.28.

### Patch Changes

- Updated dependencies [[`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`e5a4317`](https://github.com/nizam-os/kit-ts/commit/e5a43172be2e8ed4c35168b26ebfecff4efece60), [`2485317`](https://github.com/nizam-os/kit-ts/commit/2485317ff47933f84f7c41557700dd4b9d358461), [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6), [`fee2388`](https://github.com/nizam-os/kit-ts/commit/fee2388e2800091b3a91265a16d91371b65e10ec), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989)]:
  - @nizam-os/keyset-core@0.1.0
