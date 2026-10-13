# ADR 0011: The catalog's type is a named interface

- Status: accepted
- Date: 2026-10-10

## Context

ADR 0004 wrote each catalog module as `export const catalog = <literal> as const;`, typed by
`typeof catalog`. That type is the literal's, which has no name, so TypeScript prints it member by
member wherever it appears in a message. A declaration library carries the catalog in its own types,
so a mistake in a declaration of `@nizam-os/resource-core` printed the catalog, and TypeScript cut
the message short before the members the user wrote:

```text
Property '"access: the scope column is read-only"' is missing in type '{ target: () => DeclaredResource<DeclareContext<{ readonly format: 3; readonly enums: { readonly contact_kind: readonly ["person", "company"]; ...
```

The printing also dominates the time such an error takes to check. On the stern schema, 111
declarations whose 76 errors each name a declared resource checked in 13.4 s with 5.8 GB of memory;
with the literal behind a named interface, the same file checked in 0.44 s with 183 MB, and a file
without errors took 0.18 s either way (TypeScript 7.0.2, `--checkers 1`). An editor pays this on
every keystroke of a half-written declaration.

TypeScript prints an interface by its name: "Interfaces will always be named in error messages",
"when they are used by name". A type alias does not help here, since it names only a type it creates
itself, and `typeof value` is the literal's own anonymous type. An interface may extend an object
type whose members are known statically, which the literal's type is, but its `extends` clause takes
a type reference, not a `typeof` query. @ref
https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces
@ref https://www.typescriptlang.org/docs/handbook/2/objects.html#extending-types

## Decision

- A catalog module holds the literal under a private name, `const value = <literal> as const;`, then
  `export interface <Name> extends Readonly<typeof value> {}` and
  `export const catalog: <Name> = value;` (`publicCatalog` in the public module). The interface
  restates no member, so it cannot drift from the literal; `Readonly` turns the query into a type
  reference and changes nothing, since `as const` already made every member readonly.
- The names default to `ExtractedCatalog` and `ExtractedPublicCatalog`: fixed, as the Kysely types'
  `DB` is, and distinct from `Catalog` and `PublicCatalog`, which ADR 0004 leaves to the model.
  `out.catalog: { file, interface }` and `out.public.interface` name them after the application. A
  name is an ASCII identifier that starts with an uppercase letter, so it is never a keyword or a
  predefined type name, and the two modules' names differ, so a message that names both stays clear.
- `parseCatalogModule` reads the JSON up to the last ` as const;`, so a module written before this
  decision still parses. `CATALOG_FORMAT` stays 3: it versions the model's shape, not the module
  around it.

Deriving the default from the file name was rejected: `catalog.ts` would give `Catalog`, the model's
name, and a file name need not be an identifier. Writing the interface out member by member, as a
schema-first generator would, doubles the file and invites the two copies to disagree.

## Consequences

Compile errors name the catalog (`DeclareContext<ContactsPublicCatalog, ...>`), and a file full of
them checks in about the time of a correct one. `typeof catalog` still works, since it is the
interface, and the interface is assignable to the model types. Committed modules read as stale to
`extract --check` once, until they are extracted again. The generated module carries an empty
interface, which linters flag (`@typescript-eslint/no-empty-object-type` in its default
configuration); generated files are excluded from linters as they already are from formatters (ADR
0004).
