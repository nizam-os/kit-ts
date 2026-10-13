# ADR 0003: Replay migrations into PGlite or a throwaway database on a server

- Status: accepted
- Date: 2026-10-10

## Context

The catalog must describe what the migrations produce, not what some long-lived database happens to
contain, so extraction replays the migrations into an empty database first. Orchestrating containers
(pulling images, picking ports, waiting for readiness) would make the library depend on Docker and
on the host's container runtime. PGlite runs PostgreSQL in-process from WebAssembly, ships the
contrib extensions as imports, and its 0.5 line runs PostgreSQL 18; CI already runs PostgreSQL
servers as services. @ref https://pglite.dev/extensions/

Replay order matters. Flyway, the most common SQL-file tool, names versioned migrations
`V<version>__<description>.sql`, orders them numerically by version, and runs repeatable `R__` files
after them in description order. @ref
https://documentation.red-gate.com/fd/versioned-migrations-273973333.html @ref
https://documentation.red-gate.com/fd/migrations-271585107.html

Several session settings change what a migration stores or how PostgreSQL deparses it: a
`timestamptz` constant is converted with the session `TimeZone`, `DateStyle` and `IntervalStyle`
shape constants, `extra_float_digits` and `bytea_output` change how constants print,
`standard_conforming_strings` changes how string constants parse and print, and `search_path`
decides both where unqualified objects are created and whether deparsed names are qualified.

## Decision

- The replay target is PGlite by default, with the configured extensions loaded (contrib extensions
  by name, any other PGlite extension as an object), or a server named by a connection URL. On a
  server, extraction creates a database named `nizam_catalog_<random>` from `template0` with `UTF8`
  encoding, replays into it, extracts, and drops it, so the user needs `CREATEDB`. The library
  starts no containers; the documentation shows how to run one.
- Migrations come from a directory or from a function returning `{ name, sql }` entries. In a
  directory, `V<version>__*.sql` files run in numeric version order followed by `R__*.sql` in
  description order when every SQL file follows Flyway's naming; otherwise every `*.sql` file except
  `*.down.sql` runs in natural order of its relative path, with digit runs compared as numbers.
  `U*__*.sql` undo files never run.
- Each file runs as one simple-protocol query with `TimeZone` `UTC`, `DateStyle` `ISO, YMD`,
  `IntervalStyle` `postgres`, `extra_float_digits` `1`, `bytea_output` `hex`, and
  `standard_conforming_strings` `on` set first; reading pins the same settings. A failing file
  aborts the extraction with its name and the PostgreSQL error.

## Consequences

Extraction works with nothing but Node.js and the migration files, and CI tests both targets. A
migration that needs an extension PGlite does not ship, or a server-side feature PGlite lacks, needs
the server target. A file that relies on psql meta-commands, `COPY ... FROM stdin`, or statements
that refuse to run inside a transaction block (such as `CREATE INDEX CONCURRENTLY` alongside other
statements) must be adapted or split.
