---
'@nizam-os/resource-core': minor
---

A new `@nizam-os/resource-core/server` entry holds what a server composes over the declarations,
typed by the application's own permissions, quotas, services, and error codes.

- `createDomainDefiners<TDomain>()` returns `definePolicy` and `defineResource`. A policy holds one
  predicate per operation and per includable relationship and allows only on exactly `true`; a
  missing predicate denies, and `denyAll` is the policy of a resource without one. A denied `list`
  or `create` is `FORBIDDEN`, a denied `get`, `update`, or `remove` `NOT_FOUND`, as for a missing
  row. A behavior gives each writing operation its rules, effects, quota on create, and `values`,
  the server values `tsc` requires exactly when the table has columns no client member covers.
- `reject(code, { fields, detail })` refuses from a rule with one of the application's codes, and
  `rejectionError` builds its error. `defineScope` and `scopeValues` bind tenant scopes to the actor
  and to the session parameters row security reads; `defineQuota` and `quotaExceeded` give
  `QUOTA_EXCEEDED`, failing closed; `defineEvent` declares versioned events whose payloads any
  Standard Schema validates.
- `constraintError(thrown, { resource, operation, pointer })` gives the declared code of a
  PostgreSQL integrity violation from any supported driver, with an item per member and the driver
  error as `cause`, or `undefined` for what the ban's own mapping should answer. Every integrity
  violation of a remove is `CONFLICT`.
- `StorageAdapter<TTransaction>` is the contract a storage adapter implements, `lock` included,
  which holds the row an update or a remove decides on until the transaction ends.
  `@nizam-os/resource-core/testing` adds `storageContract(harness)`, cases named after each of the
  ten obligations, concurrent ones among them, and `contractFixture`, the schema, seed, catalog, and
  declarations they run on.
