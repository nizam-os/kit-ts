---
'@nizam-os/resource-core': minor
---

Declared resources carry the error codes clients can cause, and `errorCatalog` assembles them into
one `@nizam-os/ban-core` catalog.

- `errors` on each resource maps every derived code to a frozen `{ status, title, kind, fields }`
  with literal types: one code per constraint over a member, per NOT NULL member an operation
  writes, per CHECK of a domain a member passes, and for the primary key with `clientIds`. CHECK and
  NOT NULL give 422 Invalid Attribute, UNIQUE, PRIMARY KEY, and EXCLUDE 409 Conflict, and FOREIGN
  KEY 404 Related Resource Not Found. `fields` lists the public members the error points at.
- The scope column makes no code and is never pointed at, since the server writes it: a UNIQUE over
  `(organization_id, email)` points at `email`, the scope's foreign key has no code, and `code` on
  it is refused.
- A domain CHECK's code is the definer's domain rule `code`, or its constraint name upper-cased.
  `declareResource` refuses a resource whose codes repeat or fall outside A-Z, 0-9, and `_`, naming
  the constraints behind them.
- `errorCatalog(resources, appErrors?)` returns the listed resources' codes, then `QUOTA_EXCEEDED`
  (403), then the application's codes, frozen, to spread into `createBan({ errors })` next to
  `ERROR_CATALOG`. It refuses, in one `TypeError`, a resource listed twice, two resources of one
  type, a code two constraints derive or that `@nizam-os/ban-core`, `@nizam-os/jsonapi-core`,
  resource-core, or the application already has, and a relationship whose target is not listed;
  `tsc` reports the last at the listed resource. The `ErrorCatalog`, `ErrorEntry`, and
  `ConstraintKind` types describe the results.
