# ADR 0008: Drift compares a live database with the committed catalog

- Status: accepted
- Date: 2026-10-10

## Context

A deployed database can diverge from its migrations: a column added by hand during an incident, a
policy dropped to unblock a job, a CHECK changed outside the migration tool. Nothing in the
application notices until a request fails or, worse, succeeds when it should not. The committed
catalog at the deployed release states what the database should contain.

## Decision

- `drift` connects with a configured URL, intended for a read-only role, extracts the live catalog
  with the same queries and normalization as `extract` inside a `REPEATABLE READ READ ONLY`
  transaction (replaying nothing, and unable to write even with a privileged URL), and compares it
  with the committed catalog file.
- The comparison is structural (`diffCatalogs` in `@nizam-os/catalog-core`): every table, column,
  constraint, index, policy, enum, domain, and extension present on one side only, and every member
  whose value differs, reported with its path and both values.
- The command prints the differences grouped by object kind, or the structured diff as JSON with
  `--json`, and exits with 1 when there are any, 0 when there are none, and 2 when it could not run.

## Consequences

A scheduled CI job can watch production and open an incident on a non-zero exit. The role needs only
`CONNECT` and `USAGE` on the configured schemas: every role can read the system catalogs and the
deparse functions, and drift reads no table data. `USAGE` matters because PostgreSQL leaves a schema
the role cannot use out of its effective `search_path` and then qualifies every name in it, which
would show up as drift; the command checks it first and refuses to run without it. Differences that
come from session-dependent deparsing are ruled out by pinning the same settings as `extract`.
