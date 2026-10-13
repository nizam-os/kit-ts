---
'@nizam-os/resource-core': minor
---

Declared resources carry their public names, derived from the database names as JSON:API clients
expect them.

- `names` on each resource holds the type, the primary key column, and both directions of every
  mapping as `ReadonlyMap`s: field and relationship names to columns and back, and error codes to
  constraint names and NOT NULL keys and back. The `ResourceNames` type describes it.
- A field is named by camelCase of its column, the conversion of Kysely's `CamelCasePlugin`, and a
  relationship by camelCase of its column without `_id`. The type is the table's name, and a code is
  the rule key upper-cased. `as` overrides a name, and `code` overrides a code.
- `tsc` reports a name JSON:API refuses, a member named `type`, `id`, `lid`, `constructor`, or
  `prototype`, two members under one name, a relationship column without `_id` and no `as`, and a
  given code that is not A-Z, 0-9, and `_`, repeats another code, or sits on a key clients cannot
  violate. Each message names the option to set.
- The runtime check of each declaration reports the same mistakes, and also those TypeScript leaves
  to it because checking them in types costs more than they catch on real catalogs: a derived code
  outside the pattern or repeated, a column only a quoted identifier can name, and two columns a
  Unicode case mapping gives one name.
