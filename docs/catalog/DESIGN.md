# catalog: design

- Status: accepted for the 0.x line of `@nizam-os/catalog-core` and `@nizam-os/pg-catalog`

Architecture decisions referenced as ADR-NNNN live in `docs/catalog/adr/`. The normative contract is
[`SPEC.md`](SPEC.md); this document explains what the packages are for and why they are shaped the
way they are.

## 1. Purpose

SQL migrations are the source of truth for storage, but TypeScript cannot see them. Column types,
nullability, defaults, CHECK constraints, enum labels, and row security policies end up restated by
hand in validation schemas, form metadata, API documentation, and Kysely interfaces, and each copy
drifts on its own schedule. The catalog packages make the database's own description of itself a
TypeScript value:

1. **Replay and extract.** `@nizam-os/pg-catalog` replays the migrations into an empty PostgreSQL
   (PGlite in-process, or a throwaway database on a server, ADR-0003), reads `pg_catalog`, and
   builds one model of every table, column, constraint, index, policy, enum, and domain.
2. **Write three files.** The full catalog for servers, a public slice for browsers (ADR-0005), and
   the Kysely types (ADR-0007), all deterministic, so they are committed and reviewed with the
   migration (ADR-0004).
3. **Translate what can be translated.** CHECK constraints whose meaning a client can enforce
   exactly (length bounds, numeric ranges, membership, `IS NOT NULL`, a subset of regular
   expressions) become rules; everything else is marked `null` for a validator to cover (ADR-0006).
4. **Keep the loop closed.** `extract --check` proves the committed files current in CI, and `drift`
   compares a live database with the committed catalog on a schedule (ADR-0008). The oracle
   (`rules --check`) runs the fixtures of the declared resources through their Zod schemas and
   through the replayed database, and reports each value they disagree on (ADR-0012);
   `surface --check` compares the committed API surface of those declarations with the current one
   and fails on a breaking change.

### Who it is for

Applications that write SQL migrations by hand (Flyway, dbmate, golang-migrate, or plain files) and
want their API layer, forms, and query builder typed by what the migrations actually create. The
model is consumed by `@nizam-os/resource-core` and `@nizam-os/kysely-resource`, but it is plain data:
anything can read it.

### Non-goals

- Running migrations against real environments. Extraction only ever replays into a database it
  creates and drops; deployment stays with the migration tool.
- Describing every PostgreSQL object. Views, functions, triggers, sequences, and partitions are not
  in the model; a new kind enters with an ADR.
- Inferring rules from anything but CHECK constraints and column types. The recognizer never guesses
  (ADR-0006).
- Starting containers. The documentation shows how to run one; the library talks to a URL.

## 2. Principles

1. **The migrations are the input; the catalog is a function of them.** Same files, same bytes, on
   every machine and every supported PostgreSQL major (ADR-0004).
2. **PostgreSQL describes itself.** Expressions are what `pg_get_constraintdef`, `pg_get_expr`, and
   `pg_get_indexdef` return; types are what `format_type` and `pg_type` say. The library parses
   deparsed text only to translate it, and keeps the original next to the translation.
3. **Never guess.** A rule exists only when it is equivalent to its CHECK for every non-null value;
   a literal default value exists only when the default is a literal. Otherwise the field is `null`
   or absent, and the consumer knows a human decision is needed.
4. **Public is a decision.** A table reaches a browser only when the configuration names it, and
   only the facts a form needs travel with it (ADR-0005).
5. **One extraction path.** `extract`, `extract --check`, and `drift` run the same queries with the
   same session settings, so a difference is a difference in the database, not in the tool.
6. **The core knows no database.** The model types and the pure functions over them live in
   `@nizam-os/catalog-core`, which browsers can import; everything that needs a driver or a file
   system lives in `@nizam-os/pg-catalog` (ADR-0002).

## 3. The workflow by example

### 3.1 Configuration

```ts
// pg-catalog.config.ts
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'db/migrations',
  database: { pglite: { extensions: ['pg_trgm'] } },
  schemas: ['public'],
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['contacts'] },
    types: 'src/generated/db.ts',
  },
  drift: { production: { url: () => process.env['PRODUCTION_READONLY_URL'] } },
});
```

### 3.2 A migration

```sql
-- db/migrations/V1__contacts.sql
create extension if not exists pg_trgm;

create type contact_kind as enum ('person', 'company');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  name text not null,
  kind contact_kind not null,
  email varchar(320),
  phone text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint contacts_name_length check (char_length(name) between 1 and 200),
  constraint contacts_phone_format check (phone ~ '^\+[1-9][0-9]{6,14}$')
);

create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);

alter table contacts enable row level security;
create policy contacts_tenant on contacts
  using (organization_id = current_setting('app.organization_id', true));
```

### 3.3 Extract

```bash
pg-catalog extract           # replay, extract, write the three files
pg-catalog extract --check   # replay, extract, fail on any difference from the committed files
pg-catalog drift --env production
```

The full catalog (excerpt) records what PostgreSQL deparsed and what the recognizer read from it.
`BETWEEN` came back as two comparisons, and the length rule counts code points:

```text
// Generated by @nizam-os/pg-catalog. Do not edit: change the migrations and run `pg-catalog extract`.
const value = {
  "format": 3,
  "schemas": [
    "public"
  ],
  "extensions": [
    "pg_trgm"
  ],
  "enums": {
    "contact_kind": [
      "person",
      "company"
    ]
  },
  "domains": {},
  "tables": {
    "contacts": {
      "schema": "public",
      "name": "contacts",
      "comment": null,
      "primaryKey": [
        "id"
      ],
      "columns": {
        "name": {
          "type": "text",
          "typeKind": "base",
          "array": false,
          "sqlType": "text",
          "maxLength": null,
          "precision": null,
          "scale": null,
          "collation": null,
          "nullable": false,
          "default": null,
          "identity": null,
          "generated": null,
          "comment": null
        },
        "tags": {
          "type": "text",
          "typeKind": "base",
          "array": true,
          "sqlType": "text[]",
          ...
          "default": {
            "expression": "'{}'::text[]",
            "literal": "{}"
          },
          ...
        },
        ...
      },
      "constraints": {
        "contacts_name_length": {
          "kind": "check",
          "columns": [
            "name"
          ],
          "expression": "((char_length(name) >= 1) AND (char_length(name) <= 200))",
          "rule": {
            "kind": "length",
            "min": 1,
            "max": 200
          },
          "validated": true,
          "enforced": true,
          "definition": "CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)))"
        },
        "contacts_phone_format": {
          ...
          "rule": {
            "kind": "pattern",
            "source": "^\\+[1-9][0-9]{6,14}$",
            "flags": "su"
          },
          ...
        },
        ...
      },
      "indexes": { ... },
      "rowSecurity": {
        "enabled": true,
        "forced": false,
        "policies": {
          "contacts_tenant": {
            "command": "all",
            "permissive": true,
            "roles": [
              "public"
            ],
            "using": "(organization_id = current_setting('app.organization_id'::text, true))",
            "withCheck": null
          }
        }
      }
    }
  }
} as const;

/** The type of `catalog`, by a name compile errors print in place of its members. */
export interface ExtractedCatalog extends Readonly<typeof value> {}

export const catalog: ExtractedCatalog = value;
```

(`...` marks members left out of the excerpt; the real file lists every member of every object, SPEC
2, and `e2e/catalog/expected/` holds the complete files for a realistic schema.)

The public catalog keeps what a form needs and drops expressions, comments, and policies; of the
indexes it keeps the unique ones no constraint backs, as unique constraints (ADR-0009), and it marks
a NOT ENFORCED CHECK or foreign key with `enforced: false`, so a form never applies what the
database never checks (ADR-0010). The Kysely types follow the driver's parsers: `created_at` is a
`Date` the database supplies, so it is optional on insert, and `tags` has a default, so it is too,
and takes PostgreSQL's array text as well as an array.

```ts
export interface ContactsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  kind: ContactKind;
  email: string | null;
  phone: string | null;
  tags: ColumnType<Array<string>, Array<string> | string | undefined, Array<string> | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}
```

### 3.4 Use

A server imports the full catalog, a browser bundle the public one, and Kysely the `DB` interface;
none of them imports `@nizam-os/pg-catalog` at runtime. Libraries that accept a catalog type their
parameters with `@nizam-os/catalog-core` and infer the rest from the literal:

```ts
import type { PublicCatalog } from '@nizam-os/catalog-core';

import { publicCatalog } from './generated/public-catalog';

declare function columnsOf<TCatalog extends PublicCatalog, TTable extends keyof TCatalog['tables']>(
  catalog: TCatalog,
  table: TTable,
): Array<keyof TCatalog['tables'][TTable]['columns']>;

columnsOf(publicCatalog, 'contacts'); // Array<'id' | 'organization_id' | 'name' | ...>
```

## 4. Architecture

### 4.1 Modules

`@nizam-os/catalog-core` is types plus two pure functions: `toPublicCatalog(catalog, tables)` (the
slice, ADR-0005) and `diffCatalogs(expected, actual)` (the structural comparison, ADR-0008).

`@nizam-os/pg-catalog` is a pipeline of small modules: the migration loader (directory or function,
Flyway-aware ordering), the targets (PGlite and a throwaway database on a server behind one
`SqlSession` interface), the replay, the extraction queries (one per object kind, each returning a
single JSON document so both drivers parse alike), the normalizers (types, literal defaults, search
configuration), the CHECK recognizer (a tokenizer and a parser for the deparsed subset), the
renderers (catalog module, public module, Kysely types), the check and drift commands, the
configuration (`defineExtraction`), and the CLI (`node:util` `parseArgs`, no dependencies).

### 4.2 Data flow

```
migrations ──load──▶ files ──replay──▶ empty database ──extract──▶ Catalog ──┬─▶ catalog.ts
                                                                            ├─▶ public-catalog.ts (toPublicCatalog)
                                                                            └─▶ db.ts (Kysely types)
committed catalog.ts ──parse──▶ Catalog ◀──diffCatalogs──▶ live Catalog ◀──extract── live database
```

## 5. Decisions

| ADR  | Decision                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                                   |
| 0002 | A database-free core (`@nizam-os/catalog-core`) and a PostgreSQL binding (`@nizam-os/pg-catalog`) |
| 0003 | Replay migrations into PGlite or a throwaway database on a server; Flyway-aware ordering        |
| 0004 | The catalog is deterministic TypeScript: JSON under `as const`, fixed order, no volatile facts  |
| 0005 | The public catalog is an explicit, expression-free slice                                        |
| 0006 | CHECK constraints become rules only when the rule is equivalent                                 |
| 0007 | Kysely types are generated from the catalog with node-postgres's default mapping (amended)      |
| 0008 | Drift compares a live database with the committed catalog                                       |
| 0009 | A unique index that no constraint backs is a public unique constraint                           |
| 0010 | A NOT ENFORCED constraint is public and marked as such                                          |
| 0011 | The catalog's type is a named interface, so compile errors print its name                       |
| 0012 | The oracle writes fixtures into copies of the columns, catching refusals in the database        |
| 0013 | The Kysely types follow the application's driver: node-postgres or PGlite's own parsers         |
