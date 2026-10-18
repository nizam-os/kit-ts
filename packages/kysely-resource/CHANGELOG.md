# @nizam-os/kysely-resource

## 0.1.0

### Minor Changes

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6) Thanks [@ali-issa](https://github.com/ali-issa)! - Every refused filter value of a request is reported at once. `InvalidFilterValueError` carries
  `values`, one `{ field, operator, expected }` per condition whose value its field's type refuses, in
  the order of the request's conditions, in place of its single `field`, `operator`, and `expected`. A
  malformed filter, or a field or operator the definition does not have, is still reported alone,
  before any value. `@nizam-os/kysely-resource` answers one `INVALID_QUERY_PARAMETER` error object per
  refused value, at its `filter[<field>][<operator>]`, so a client fixes every value in one round
  trip.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `checkResourceRuntime` and `createResourceRuntime`. Both check the composition against the full
  catalog `pg-catalog extract` writes: behaviors keyed by their types, the scope bindings, the
  resources that run without a scope, includable targets, quotas, the outbox table, and row security
  policies that read each scope's parameter for every command the operations run, with warnings for
  unserved sorts and for unique indexes that leave the scope out. `checkResourceRuntime` runs them
  without a connection, for CI. `createResourceRuntime` also refuses a role that is a superuser, has
  `BYPASSRLS`, or owns a scoped table without `FORCE ROW LEVEL SECURITY`, and rejects with a
  `BootError` listing every problem. Otherwise it resolves to a runtime whose `as(actor)` returns the
  domain, typed by the behaviors.

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`9961e76`](https://github.com/nizam-os/kit-ts/commit/9961e76d7abaddc2d64adfa51f765f1edd742538) Thanks [@ali-issa](https://github.com/ali-issa)! - Requires `kysely` 0.29.0 or later. The tests run every query against PGlite through Kysely's
  `PGliteDialect`, which 0.29.0 added, so 0.29.0 is the oldest release they prove the runtime on, and
  CI now runs them there.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83) Thanks [@ali-issa](https://github.com/ali-issa)! - The Kysely storage lists rows: `list` plans the request with the resource's keyset definition, binds
  every cursor to the transaction's scope values so a cursor of one tenant is refused in another, and
  with `{ total: true }` also counts the rows the filter selects. `many` reads the rows of several ids
  in the scope in one statement, for includes. `ListOptions` is exported.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`e485cf9`](https://github.com/nizam-os/kit-ts/commit/e485cf95f80e7e81339c9ad3c36b61e1676a3fee) Thanks [@ali-issa](https://github.com/ali-issa)! - `@nizam-os/resource-core` and `@nizam-os/keyset-core` are peer dependencies instead of dependencies.
  The application declares its resources and behaviors and makes the keyset definer with its own
  copies, and the runtime now works with those same copies, so ranges that cannot meet fail at install
  instead of at boot, where a second copy of `@nizam-os/resource-core` refused every behavior, or on a
  request, where a second copy of `@nizam-os/keyset-core` answered a refused cursor with 500. Install
  both next to the runtime, as the README's install line already does.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9) Thanks [@ali-issa](https://github.com/ali-issa)! - `relayOutbox({ db, outbox, deliver, limit })` delivers the events operations recorded, once their
  transactions have committed. Each run is one READ COMMITTED transaction that claims the oldest
  `limit` rows (100 by default) with `FOR UPDATE SKIP LOCKED`, hands them to `deliver` in position
  order, and deletes them, so several relays can drain one outbox side by side. When `deliver`
  rejects, the events stay for the next run: delivery is at least once, and consumers deduplicate by
  `position`. `OutboxEvent` and `RelayOptions` are exported.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`c8446a6`](https://github.com/nizam-os/kit-ts/commit/c8446a66ad6a061cb9dc9c4888050d376dafb50a) Thanks [@ali-issa](https://github.com/ali-issa)! - The Kysely storage reads and writes rows: `get`, `lock`, `create`, `update`, `remove`, `count`,
  `record`, and `partitionRoot`. A create inserts only the members present, so column defaults fill
  the rest, and an update sets only the members present. Every value travels as text cast to its
  column's type and comes back in the exact read form of its type, through the storage codec for a
  codec field; a stored value outside every read form fails the read instead of changing. `lock` takes
  the row lock its write needs, `count` locks its quota per scope value, and `record` writes events to
  the outbox table in the operation's transaction.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251) Thanks [@ali-issa](https://github.com/ali-issa)! - `runtime.transaction(actor, work)` runs every operation of the domain `work` receives in one
  transaction with the actor's scopes, one at a time. It commits when `work` resolves and no operation
  failed, handing every event to `afterCommit` once. The first failure ends the transaction at once,
  rolled back with its locks released. Its call rejects with what it threw, every later call rejects
  with a `TypeError`, and `transaction` rejects with the failure mapped as the operation alone maps
  it, or with what `work` rejected with when that is another value.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`77b6cd5`](https://github.com/nizam-os/kit-ts/commit/77b6cd5d24bbd362c2bcbb5a24bad36a7acd8c99) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `@nizam-os/kysely-resource`, the Kysely runtime for resource declarations on PostgreSQL.
  `createKyselyStorage` checks its options at startup and runs each operation in one READ COMMITTED
  transaction whose first statement fixes how values print and sets every scope's session parameter
  for that transaction only, so a pooled connection carries nothing into the next transaction. A
  statement that failed fails the transaction even when the operation caught its error and went on.

### Patch Changes

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45) Thanks [@ali-issa](https://github.com/ali-issa)! - A refused filter value's error names the query parameter the client sent, as the parser's own
  refusals do. `parseQuery`'s filter conditions keep the `parameter` they came in, as the request
  spelled it, and a condition built by hand names one too. Each entry of keyset-core's
  `InvalidFilterValueError` carries its condition's `path` in the filter tree.
  `@nizam-os/resource-core`'s `filterParameters(resource, query)` lists each condition's path and
  parameter, which a runtime's `list` takes as its `parameters` option. `@nizam-os/kysely-resource`
  then answers a refused value at that parameter, in a transaction too: `filter[status]` or
  `filter[or][0][status]`, where it answered `filter[status][eq]`. `@nizam-os/hono-resource`'s list
  route passes the parameters.

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

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09) Thanks [@ali-issa](https://github.com/ali-issa)! - The Kysely storage adapter reads a `char(n)` member, key, or relationship padded to n, as PostgreSQL
  prints it and as its read form and `schema.id` spell it. A cast to text had stripped the padding, so
  a stored `'ab  '` read as `ab`, while an array of `char(n)` kept it. The storage contract's fixture
  gains `labels`, keyed by a `char(4)` client id, and gives `tasks` a `char(4)` code and a
  relationship to a label, so the contract suite fails an adapter that strips the padding or reads a
  null one as the empty string.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989) Thanks [@ali-issa](https://github.com/ali-issa)! - `list` orders a key that is not nullable without a null placement, so an index of the scope column,
  the sort columns in their directions, and the key starts each page at its cursor however deep it is.
  The READMEs give the index advice with measurements on PostgreSQL 14.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`4538aa9`](https://github.com/nizam-os/kit-ts/commit/4538aa91ef98275ac44991410d1388bb7458d97a) Thanks [@ali-issa](https://github.com/ali-issa)! - The operations of a runtime typed by its behaviors pass where a host or a worker takes them typed
  wide, as `ResourceOperations` or in a `Domain`: they are methods, whose parameters TypeScript
  compares both ways, and stay read-only.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1) Thanks [@ali-issa](https://github.com/ali-issa)! - `@nizam-os/resource-core/server` now holds the runtime contract hosts and workers take:
  `ResourceRuntime`, `RuntimeResources`, `Domain`, `ResourceOperations`, `ResourceInput`, and
  `ListOptions`, so code given a runtime types it without Kysely or a driver.
  `@nizam-os/kysely-resource` re-exports them, so its imports keep working, and its runtime now lists
  the declared resource of each behavior as `runtime.resources`, in the order of `options.resources`.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`890844a`](https://github.com/nizam-os/kit-ts/commit/890844ae14747d4b64a38061cd31fd03484c108d), [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2), [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd), [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`5102bf1`](https://github.com/nizam-os/kit-ts/commit/5102bf1b9dbe393be599c491c937aef98387ebee), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3), [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075), [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85), [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19), [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`e5a4317`](https://github.com/nizam-os/kit-ts/commit/e5a43172be2e8ed4c35168b26ebfecff4efece60), [`2485317`](https://github.com/nizam-os/kit-ts/commit/2485317ff47933f84f7c41557700dd4b9d358461), [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6), [`fee2388`](https://github.com/nizam-os/kit-ts/commit/fee2388e2800091b3a91265a16d91371b65e10ec), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`8194261`](https://github.com/nizam-os/kit-ts/commit/81942616668548d4c7c7dae915055b85833c82e3), [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`6ff2097`](https://github.com/nizam-os/kit-ts/commit/6ff2097fead30c359ed8be7e521828d7a5cc8424), [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83), [`f8e652c`](https://github.com/nizam-os/kit-ts/commit/f8e652cde529ec1c0fdcfdd83c64bd0e471d0210), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592), [`0cb082d`](https://github.com/nizam-os/kit-ts/commit/0cb082d3939b6142d2daa2a1ebc5cc89db3591ec), [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54), [`4fe1af3`](https://github.com/nizam-os/kit-ts/commit/4fe1af3df37ed4411e64378ba87150321f20da18), [`82eca45`](https://github.com/nizam-os/kit-ts/commit/82eca45cade231500a5d75f2ba3d0d0cf72ee812), [`f4a53b4`](https://github.com/nizam-os/kit-ts/commit/f4a53b407ab4cdcb3245755ca03bb2c436a61a9d), [`e8f8ade`](https://github.com/nizam-os/kit-ts/commit/e8f8adebe8870015d0127b52593f574ebddcb916), [`e11a6cc`](https://github.com/nizam-os/kit-ts/commit/e11a6cc1ff9f68dd56a3997acfdf6acec782e283), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`0a5fe97`](https://github.com/nizam-os/kit-ts/commit/0a5fe9772396d7514147806453153cf1f3ac3547), [`2a56a8e`](https://github.com/nizam-os/kit-ts/commit/2a56a8ea4a88b0fa88650d5be15fb7e8277dc43f), [`ad320bf`](https://github.com/nizam-os/kit-ts/commit/ad320bfe3cce31a4d4e0d0f670f8fac51797ed1e), [`cd69e52`](https://github.com/nizam-os/kit-ts/commit/cd69e525896f7261d34de2710c585d0b7b65c7d9), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`e7949ba`](https://github.com/nizam-os/kit-ts/commit/e7949ba2ff768c3950259b061463488e4d7c09de), [`659c973`](https://github.com/nizam-os/kit-ts/commit/659c973dbed17e51e863e21e0c6886ae3fd01a13), [`f62c925`](https://github.com/nizam-os/kit-ts/commit/f62c925720dbfa3b0f69f306be7feb8aaf201e1e), [`4e920da`](https://github.com/nizam-os/kit-ts/commit/4e920da161a11c6b27360232d14756aa36718b8d), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`8a87a9f`](https://github.com/nizam-os/kit-ts/commit/8a87a9fa2feada78b4a7a5a490a36c19fdd7eb85), [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a), [`f475362`](https://github.com/nizam-os/kit-ts/commit/f475362adca6a54d11a4ebaf5610b079a3fab9d6), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`c7efc14`](https://github.com/nizam-os/kit-ts/commit/c7efc1494831b0b206dffbb78630a3f403fb67c7), [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9), [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251), [`829408d`](https://github.com/nizam-os/kit-ts/commit/829408dfca7d6b27b43e688ebc6fe829e0e8c44d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`c052bd8`](https://github.com/nizam-os/kit-ts/commit/c052bd8a528012779deea2c20026f653a0afe7f0), [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1)]:
  - @nizam-os/jsonapi-core@0.1.0
  - @nizam-os/resource-core@0.1.0
  - @nizam-os/ban-core@1.0.0
  - @nizam-os/catalog-core@0.1.0
  - @nizam-os/keyset-core@0.1.0
  - @nizam-os/kysely-keyset@0.1.0
