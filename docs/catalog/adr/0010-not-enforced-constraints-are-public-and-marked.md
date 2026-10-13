# ADR 0010: A NOT ENFORCED constraint is public and marked as such

- Status: accepted
- Date: 2026-10-10

## Context

PostgreSQL 18 accepts `NOT ENFORCED` on a CHECK or FOREIGN KEY constraint: "If the constraint is NOT
ENFORCED, the database system will not check the constraint. It is then up to the application code
to ensure that the constraints are satisfied. [...] NOT ENFORCED constraints can be useful as
documentation if the actual checking of the constraint at run time is too expensive. This is
currently only supported for foreign key and CHECK constraints." @ref
https://www.postgresql.org/docs/18/sql-createtable.html Such a constraint is stored with
`conenforced = false` and `convalidated = false`, and rows that break it are stored without an
error. A UNIQUE constraint or a domain CHECK cannot be NOT ENFORCED (SQLSTATE 42601 and 42P17).
`ALTER CONSTRAINT ... ENFORCED` turns on a foreign key, after checking the existing rows; a CHECK
cannot be altered that way (42809) and is dropped and added again. @ref
https://www.postgresql.org/docs/18/sql-altertable.html All of this was verified on PGlite 18.3.

The full catalog records `enforced` (SPEC 2.5), and the recognizer reads no rule from an unenforced
CHECK (ADR 0006), but ADR 0005 dropped the state from the public catalog. A consumer of the public
catalog therefore took an unenforced constraint for an enforced one: `@nizam-os/resource-core`
required a validator for every unenforced CHECK, because its `rule` is `null`, refused in its
schemas what a validator or a hand-written rule forbade although the table stores it, and derived an
error code that no client can cause.

## Decision

- A public CHECK or FOREIGN KEY constraint carries `enforced`, `false` for NOT ENFORCED. The other
  kinds are always enforced and carry nothing. Validation state (`NOT VALID`) stays private: a
  constraint that is not validated is still checked on every new row.
- The public catalog keeps an unenforced constraint, with its columns, and a foreign key its
  reference, since both still document the data: the planner may rely on them, and a foreign key
  still relates two tables.
- `CATALOG_FORMAT` becomes 3, since the public file's shape changes.
- A consumer that derives client-facing checks or error codes MUST skip a constraint whose
  `enforced` is `false`. `@nizam-os/resource-core` applies no rule of it in its schemas, takes no
  validator for it, and derives no code for it, while an unenforced foreign key still declares a
  relationship.

## Consequences

A schema or form built from the public catalog accepts every value the database stores, so a row
imported against an unenforced constraint can be read and saved again unchanged. An application that
wants a rule enforced for clients enforces it in the database: for a foreign key,
`ALTER TABLE ... ALTER CONSTRAINT ... ENFORCED`; for a CHECK, drop it and add it again without NOT
ENFORCED. The next `pg-catalog extract` then carries the rule and resource-core derives its code. A
rule the database cannot afford to check belongs in the application's own logic, with an error the
application defines. Every committed catalog needs `pg-catalog extract` again. This amends ADR 0005,
which listed the public members of each constraint, and ADR 0006, whose `null` rule no longer always
means that a validator must cover the constraint.
