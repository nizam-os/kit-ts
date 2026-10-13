# ADR 0006: Fixtures are mandatory on codecs and validators; the database is the oracle

- Status: accepted
- Date: 2026-10-10

## Context

The CHECK recognizer translates a constraint into a rule only when the two are equivalent (catalog
ADR 0006); the rest is left to people. A validator re-implements a CHECK in JavaScript and a codec
re-implements a type's text form, and both can disagree with PostgreSQL in ways a reviewer will not
see: regular expression dialects, `real` comparisons promoted to `double precision`, rounding to a
scale, code points against UTF-16 units. The disagreement surfaces in production as a request the
client was told is valid and the database rejects, or the reverse.

PostgreSQL can answer the question directly: writing a value into a column of its type that holds
its CHECK gives the database's verdict on it, and the stored text its canonical form (catalog ADR
0012 settles how).

## Decision

- `defineCodec` requires `fixtures`, a non-empty list of wire values typed by its schema;
  `defineValidator` requires `fixtures.accept` and `fixtures.reject`, each a non-empty list. Without
  them the call does not compile.
- `pg-catalog rules --check` (catalog SPEC 10.3) runs every fixture of every declared resource
  through the Zod schema and through the replayed database, and generated boundary fixtures for
  every member; a disagreement fails the check with the value and how the two verdicts differ.
  `oracleCases` (SPEC 7.3) builds what it runs.
- The default wire forms and the rule translations of `@nizam-os/resource-core` are proven the same
  way in its end-to-end suite, on PGlite and on PostgreSQL 14 and 18 servers.

## Consequences

A validator costs a few examples, which also document it and seed OpenAPI examples. CI needs a
database, and PGlite in-process is enough. The oracle can only find disagreements on values someone
thought of, so the generated boundary fixtures (each bound, its neighbors, empty strings, astral
characters, the type's limits) carry most of the weight.
