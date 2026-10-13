# ADR 0005: The public catalog is an explicit, expression-free slice

- Status: accepted; amended by ADR-0009 (a unique index that no constraint backs appears among the
  public constraints, marked `partial` when a predicate limits it) and ADR-0010 (a CHECK or foreign
  key keeps `enforced`)
- Date: 2026-10-10

## Context

A browser needs some database facts to build forms and validate input before a request: column
types, nullability, whether a value may be omitted because the database supplies it, enum labels,
length and range rules. The full catalog also holds what a browser must never see: tables that are
not part of the API, policy expressions that name session settings, index definitions, comments
written for operators, and CHECK expressions that may reveal more than their rule.

## Decision

- The public catalog lists only the tables the configuration names in `public.tables`; naming a
  table the migrations do not create fails the extraction.
- For those tables it keeps the primary key; per column the type facts, nullability, the default
  without its expression (so a client knows it may omit the column, and sees the constant when the
  default is one), the identity kind, and whether the column is generated with its text search
  configuration; per constraint the kind, the columns, the referenced table and columns of a foreign
  key, `nullsDistinct` of a unique constraint, and the rule of a check. It keeps the enums and
  domains those columns use, with the rules of the domain checks.
- It drops comments, default and generation expressions, constraint and index definitions, CHECK
  expressions, indexes, row security, and policies.
- `@nizam-os/catalog-core` computes the slice (`toPublicCatalog`), so its content is a pure function
  of the full catalog and the table list.

## Consequences

A form library can be typed by the same facts the server enforces without shipping internals, and a
reviewer sees in one diff what became public. Exposing a table is a deliberate configuration change.
A rule that the recognizer could not translate appears as `null`, so the API layer knows a validator
must cover it.
