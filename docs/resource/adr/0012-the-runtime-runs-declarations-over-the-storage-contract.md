# ADR 0012: The runtime runs declared resources over the storage contract, in text, inside row security

- Status: accepted
- Date: 2026-10-11

## Context

ADR 0008 kept the core free of hosts. `@nizam-os/resource-core/server` defines the domain definers,
the lifecycle every operation runs (SPEC 12.3), and the storage adapter contract with the suite that
proves it (12.8, 12.9). It leaves the runtime to `@nizam-os/kysely-resource` (epic #23). The
end-to-end suite composes a minimal runtime over a reference adapter written in plain SQL. An
application needs that composition as a package: one place that runs every operation in a scoped
transaction, maps every failure to its declared error, and refuses to start when the database would
not hold the tenant boundary. Five questions follow.

1. What the runtime runs on: any storage adapter, or Kysely.
2. How values cross the driver. Drivers parse results by type, each its own way: node-postgres turns
   a `timestamptz` into a `Date`, which drops the microseconds, PGlite turns an `int8` into a
   `BigInt`, and an application may replace any parser. A `timestamptz` printed in the session's
   time zone or `DateStyle` changes its text. The reference adapter and `pg-catalog rules --check`
   (catalog ADR 0012) already sent text and read text, and the contract's values (an `int8` past
   2^53, a `numeric` read as a float, a `timestamptz` at millisecond precision or in the local zone,
   array elements that need quoting) are the ones drivers get wrong by default.
3. How it makes sure row security holds. PostgreSQL applies a table's policies only when row
   security is enabled, never to superusers or roles with `BYPASSRLS`, and to the table's owner only
   under `FORCE ROW LEVEL SECURITY`. Permissive policies are combined with `OR`, so one policy
   granting every row defeats a scoped one; restrictive policies are combined with `AND`. stern
   enables row security on its tenant tables, forces it on some only, and reads
   `app.user.organization_id` in `USING`, sometimes next to an administrator bypass.
4. How a cursor stays inside its scope. Two organizations asking for the same page send the same
   request, so a cursor issued in one would be accepted in the other (keyset ADR 0015).
5. What happens to the events effects return. They are written in the operation's transaction (SPEC
   12.7), and delivery after commit belongs to the runtime.

@ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html @ref
https://www.postgresql.org/docs/18/sql-createpolicy.html @ref
https://www.postgresql.org/docs/18/functions-info.html (`row_security_active`) @ref
https://microservices.io/patterns/data/transactional-outbox.html @ref
https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE (`SKIP LOCKED`)

## Decision

1. `@nizam-os/kysely-resource` ships two things. The first is a storage adapter over Kysely,
   `createKyselyStorage`, which the contract suite proves on PGlite and on PostgreSQL servers. The
   second is `createResourceRuntime`, which runs the lifecycle of SPEC 12.3 over that adapter. The
   runtime takes the Kysely adapter rather than any adapter, because it verifies row security at
   boot through the adapter's connection. The reference adapter stays an independent implementation
   of the contract.
2. Values cross the driver as text both ways. Every parameter of the adapter's own statements is
   sent as text and cast, `$n::text::<type>`, so the type's input function reads it as it would read
   a literal. A list's plan is rendered by `@nizam-os/kysely-keyset`, whose values keyset-core has
   validated and keeps as strings wherever a driver could alter them, temporal and
   arbitrary-precision values among them, so PostgreSQL types each from the column it is compared
   with (keyset SPEC 4.3). Every value is selected as `<column>::text` and turned into the read form
   of SPEC 5.1 by the adapter, or by the field's storage codec. Each transaction first fixes what
   PostgreSQL's text depends on: `TimeZone` UTC, `DateStyle` ISO with year-month-day order,
   `IntervalStyle` postgres, `extra_float_digits` 1, and `bytea_output` hex. No driver parser,
   client-side serialization, or server setting can change a value on its way. Storage codecs take
   PostgreSQL's text, as `resources.storage` does for `rules --check`, so an application writes them
   once for both.
3. Row security is kept by three layers.
   - The scope's session parameter is set for the transaction only.
   - The adapter adds the scope predicate to every statement.
   - Boot checks run twice. The static check runs in CI and at boot. Every scoped resource's table
     must have row security enabled. For each command the resource's operations run (SELECT always,
     INSERT for a create, UPDATE for an update and for the row lock of a remove, DELETE for a
     remove), at least one permissive policy must apply, and either a restrictive policy reads the
     scope's session parameter or every permissive policy does. The connected check runs at boot
     only. The runtime's role must be neither superuser nor `BYPASSRLS`, and `row_security_active`
     must be true for it on each scoped table.

   `FORCE ROW LEVEL SECURITY` is not required as such. What matters is whether row security applies
   to the role that runs the operations, and only the connection knows that: a table the role does
   not own needs no `FORCE`, while one it owns does. A resource without a scope runs only when the
   application lists it in `unscoped`.

4. The adapter passes the transaction's scope values to the keyset planner as the cursor context. A
   cursor issued in one scope is refused in another. The contract gains this as obligation 12, so
   every adapter keeps it.
5. Events take the transactional outbox. The adapter writes them to an outbox table in the
   operation's transaction. After commit, the runtime hands them to `afterCommit`, a best-effort
   hook meant to wake a relay. `relayOutbox` delivers them durably: in one transaction it claims the
   oldest rows with `FOR UPDATE SKIP LOCKED`, calls `deliver`, and deletes the rows it delivered. A
   failed delivery rolls back and leaves them for the next run, so delivery is at least once.

## Consequences

- An application adds an outbox table and its bindings, and gets every operation of every declared
  resource in one composition that workers and HTTP share.
- A database where row security does not apply to the runtime's role refuses to boot instead of
  serving rows across tenants. That includes a superuser connection, a table the role owns without
  `FORCE`, and a missing policy. The static check catches the policy shape in CI before deploy. It
  reads policy text, so it proves that each policy consults the scope, not that the policy isolates
  it. An administrator bypass inside a policy still passes, and the predicate remains the second
  layer.
- Consumers of the outbox must be idempotent; each event's `position` is its key.
- Every value costs one input function call on the server; next to a round trip it does not show.
- Alternatives considered:
  - Typed parameters through the driver. Rejected: parsers are global to an application, and
    node-postgres reads `int8` arrays and `numeric` as the application configured them.
  - Requiring `FORCE` in the static check. Rejected: it is too strict for a role that does not own
    the table, as stern's runtime role would be, and it still does not catch a superuser.
  - Delivering inside the transaction. Rejected: a slow or failing consumer would hold row locks or
    roll back a committed business write, and a rolled-back write would have been delivered.
  - A `boot --check` command. Rejected: the composition is application code (behaviors, services,
    bindings), so `checkResourceRuntime` runs in the application's test suite instead.
