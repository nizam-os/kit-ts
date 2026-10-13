# ADR 0012: The oracle writes fixtures into copies of the columns

- Status: accepted
- Date: 2026-10-11

## Context

`rules --check` asks PostgreSQL for its verdict on every fixture of the declared resources: each
boundary value of a member's schema, each fixture of a validator, and each round trip of a codec
(resource SPEC 7.3, resource ADR 0006). The plan was to substitute the value into the CHECK,
`SELECT (<expression with the column replaced by $1::type>)`, and to round-trip a codec's value
through `SELECT ($1::type)::text`. Neither asks the question an application's write asks:

- Substitution needs the expression parsed and each column reference replaced. The recognizer's
  parser reads the grammar of SPEC 8.2, which is enough for rules but not for the CHECKs validators
  stand for: among the GitLab 17.11 slice's 73 CHECKs without a rule, most call functions
  (`jsonb_typeof`, `octet_length`, `cardinality`, `num_nonnulls`), and one adds two columns, which
  that grammar does not read. A CHECK can hold any expression PostgreSQL deparses.
- An explicit cast is not an assignment. `'abcd'::varchar(3)` truncates where an insert into a
  `varchar(3)` column refuses with 22001, and the cast carries neither the column's collation nor
  its NOT NULL.

Writing into the application's own table would ask the right question, but its other NOT NULL
columns, foreign keys, other CHECKs, triggers, row security, and partitions refuse rows for reasons
unrelated to the fixture.

PGlite 0.5.8 fails every statement after about 1,800 errors returned to the client on one instance,
and a refusal is an error: PostgreSQL refuses 3,690 of stern's 12,288 member fixtures (resource SPEC
15.5). @ref https://github.com/electric-sql/pglite/issues/1115

## Decision

- For each case, the replayed database gets a temporary table, `pg_temp.nizam_probe`, holding a
  copy of each column the case writes: the column's `format_type`, so its modifier and its domains
  apply, its collation when it differs from the type's, its NOT NULL when the case keeps it, and the
  CHECKs the case names, each over the expression `pg_get_expr` deparses under the search path
  extraction pinned. A domain's validator writes into a column of the domain. Nothing else of the
  table is copied, and the probe is dropped after its case.
- A fixture is written with `insert ... values (%L, ...) returning <column>::text`, each text a
  literal `format` quotes, which the column reads with its input function and assignment semantics,
  as it reads an untyped parameter. A parameter typed `text` would need a cast to most column types,
  and with it, the cast's semantics.
- A PL/pgSQL function writes a case's fixtures in one call and catches each refusal in the block's
  subtransaction, returning the SQLSTATE and constraint name from `get stacked diagnostics`. No
  refusal reaches the client: a case costs one round trip, and PGlite runs any number of them.
- `@nizam-os/resource-core/testing` builds the cases (`oracleCases`): the probe, each fixture's
  texts, and a judge that turns the database's verdict into a disagreement or none. It knows the
  schemas, the wire forms, and what agreement means; `@nizam-os/pg-catalog` knows the database. The
  registry's codecs reach the oracle through storage codecs over text (`resources.storage`), since
  the oracle writes and reads text, whatever an application's driver converts.
- A validator's probe drops the columns' NOT NULL: a CHECK passes `NULL`, so the CHECK alone decides
  its fixtures. A member's and a codec's keep it, since a member's schema judges `null` too.

## Consequences

Every verdict is the one an `INSERT` of the value would get, CHECKs of any shape included, with no
expression rewritten. On Node.js 24 and PGlite, the whole command, replay included, took 3.7 seconds
for stern's 1,322 cases and 13,128 fixtures, and 10.2 seconds for the GitLab slice's 1,557 cases and
12,313 fixtures. The runs found a codec whose fixtures were three numbers where the columns hold
`vector(768)` and an end-to-end fixture whose offset the server does not read back as written. In
the oracle itself, they found a validator's `null` fixture refused by a column's NOT NULL, which led
to the last decision, and a value with no text form, the GitLab slice's stand-in symbol, sent as an
empty text, which the cases now report as unwritable instead (resource SPEC 7.3).

The copies sit beside the application's tables only while a case runs, in `pg_temp`, so no
migration's name can collide with them. A CHECK that reads another table through a function sees the
replayed database's tables, which are empty. An application keeps a storage codec over text for each
codec in its configuration, besides its adapter's; the storage contract suite, not this check, holds
the adapter's codecs to the database.
