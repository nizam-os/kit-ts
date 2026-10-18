# @nizam-os/keyset-core

## 0.1.0

### Minor Changes

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45) Thanks [@ali-issa](https://github.com/ali-issa)! - A refused filter value's error names the query parameter the client sent, as the parser's own
  refusals do. `parseQuery`'s filter conditions keep the `parameter` they came in, as the request
  spelled it, and a condition built by hand names one too. Each entry of keyset-core's
  `InvalidFilterValueError` carries its condition's `path` in the filter tree.
  `@nizam-os/resource-core`'s `filterParameters(resource, query)` lists each condition's path and
  parameter, which a runtime's `list` takes as its `parameters` option. `@nizam-os/kysely-resource`
  then answers a refused value at that parameter, in a transaction too: `filter[status]` or
  `filter[or][0][status]`, where it answered `filter[status][eq]`. `@nizam-os/hono-resource`'s list
  route passes the parameters.

- First release: keyset pagination for any JavaScript runtime, database-free.
  
  - `defineKeyset` declares once what a collection can sort, filter, and search on: column fields of
    twelve scalar types and arrays, aggregate fields over relations (`count`, `max`, `min`, `sum`,
    `avg`), relations with their own filterable fields, a `like` or full-text search, the key that
    breaks every tie, the default sort, the page size bounds, and the cursor secret. A mistake in the
    definition is a `TypeError` naming the option.
  - `plan` validates a request (sort, a typed filter tree with a per-type operator table, search, page
    size, cursors) and returns a query plan: the sort keys with their null placement, the filter and
    seek predicates as data, the limit, and the context cursors are bound to.
  - `page` assembles the result from the fetched rows: a cursor per row, `prev` and `next`, `hasPrev`
    and `hasNext`, the optional total, and `rangeTruncated`, as the Cursor Pagination profile
    prescribes.
  - Cursors are HMAC-SHA256 signed through Web Crypto, versioned, bound to the sort, filter, and
    search they were issued for, with optional expiry and secret rotation.
  - Every request-time problem is a typed `KeysetError` with a constant message and structured fields.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e) Thanks [@ali-issa](https://github.com/ali-issa)! - Export `isFieldName` and `isSearchConfig`, the tests `defineKeyset` applies to field and relation
  names and to a full-text search configuration, so a library that derives definitions can check them
  where they are declared.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df) Thanks [@ali-issa](https://github.com/ali-issa)! - `OperatorsOf<TType>` is the operator table of SPEC 4.2 as a type: the operators a field of a type
  accepts, without the `isNull` a nullable field adds. A library that builds keyset definitions from
  its own declarations can refuse an operator at compile time, before `defineKeyset` would throw. The
  runtime table behind `operatorsFor` is typed by it, so the two cannot disagree.

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

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6) Thanks [@ali-issa](https://github.com/ali-issa)! - Every refused filter value of a request is reported at once. `InvalidFilterValueError` carries
  `values`, one `{ field, operator, expected }` per condition whose value its field's type refuses, in
  the order of the request's conditions, in place of its single `field`, `operator`, and `expected`. A
  malformed filter, or a field or operator the definition does not have, is still reported alone,
  before any value. `@nizam-os/kysely-resource` answers one `INVALID_QUERY_PARAMETER` error object per
  refused value, at its `filter[<field>][<operator>]`, so a client fixes every value in one round
  trip.

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
