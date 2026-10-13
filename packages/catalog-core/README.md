# @nizam-os/catalog-core

The PostgreSQL catalog model as TypeScript types, and the pure functions over it. A catalog
describes every table, column, constraint, index, row security policy, enum, and domain of the
schemas you configure, as PostgreSQL itself built them.
[`@nizam-os/pg-catalog`](https://www.npmjs.com/package/@nizam-os/pg-catalog) writes one from your
migrations as an `as const` module; this package is what reads it: the types, `toPublicCatalog` for
the browser-safe slice, and `diffCatalogs` to compare two catalogs. Every member and rule is
specified in
[`docs/catalog/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/catalog/SPEC.md).

## Install

```bash
pnpm add @nizam-os/catalog-core
```

No dependencies. Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported; the package
is plain functions over JSON data and never reads the environment. Install it in libraries and
applications that read a catalog; the extractor, `@nizam-os/pg-catalog`, re-exports all of it.

## Usage

```ts
import type { Catalog } from '@nizam-os/catalog-core';

import { diffCatalogs, toPublicCatalog } from '@nizam-os/catalog-core';

import { catalog } from './generated/catalog'; // written by @nizam-os/pg-catalog

const model: Catalog = catalog; // a generated literal is assignable to the model

catalog.tables.contacts.columns.email.nullable; // typed as the literal `true`
catalog.enums.contact_kind; // readonly ['person', 'company']

const browserSafe = toPublicCatalog(catalog, ['contacts', 'organizations']);
const { changes } = diffCatalogs(catalog, liveCatalog);
```

Because the generated module is JSON under `as const`, every name, type, and bound is a literal type
that declaration libraries can infer from, and the module imports nothing at runtime.

## The model

| Type            | What it holds                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Catalog`       | `format`, the configured `schemas`, the `extensions` installed into them, and `enums`, `domains`, and `tables` keyed by reference name                                                                  |
| `CatalogTable`  | `schema`, `name`, `comment`, `primaryKey`, and `columns` (in column order), `constraints`, `indexes`, and `rowSecurity`                                                                                 |
| `CatalogColumn` | `type` (`int4`, `varchar`, an enum or domain name), `typeKind`, `array`, `sqlType` (`character varying(320)`), length, precision, scale, collation, nullability, default, identity, generation, comment |
| `Constraint`    | a primary key, unique, foreign key, check, or exclusion constraint, with its columns and PostgreSQL's own `definition`                                                                                  |
| `CatalogIndex`  | the access method, uniqueness, key and `INCLUDE` columns, the partial index predicate, and the definition                                                                                               |
| `RowSecurity`   | whether row security is enabled and forced, and every policy with its command, roles, `USING`, and `WITH CHECK`                                                                                         |
| `CatalogDomain` | the base type with its modifiers, nullability, default, and CHECK constraints                                                                                                                           |
| `Rule`          | what a CHECK constraint states, when it can be read exactly: a length, a numeric range, a set of values, not null, or a pattern                                                                         |

A **reference name** is the object's name in the default schema (the first configured one) and in
`pg_catalog`, and `<schema>.<name>` elsewhere: `contacts`, `int4`, `audit.changes`. Expressions,
definitions, and defaults are PostgreSQL's deparsed text, and a default whose constant a client can
send as text also carries it as `literal` (`'active'::text` has the literal `active`).

## Enforcing a rule

A check constraint's `rule`, on a table or a domain, states what the CHECK accepts in a form a
client can test before it sends a request; `null` means the CHECK could not be read exactly, so a
validator of your own must cover it. A table's rules sit on its check constraints, each naming its
one column in `columns`; a domain's apply to every column of that type, through domains over
domains. Enforced like this, a rule gives PostgreSQL's verdict on every value:

```ts
import type { RangeBound, Rule } from '@nizam-os/catalog-core';

/** Exact comparison of decimal strings such as `-12.50`: negative, zero, or positive. */
function compareDecimals(left: string, right: string): number {
  const [leftWhole = '', leftFraction = ''] = left.split('.');
  const [rightWhole = '', rightFraction = ''] = right.split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const scaled = (whole: string, fraction: string): bigint => {
    const digits = BigInt(whole.replace('-', '') + fraction.padEnd(scale, '0'));
    return whole.startsWith('-') ? -digits : digits;
  };
  return Math.sign(Number(scaled(leftWhole, leftFraction) - scaled(rightWhole, rightFraction)));
}

function satisfies(order: number, bound: RangeBound): boolean {
  return bound.inclusive ? order >= 0 : order > 0;
}

/**
 * Whether the CHECK behind `rule` accepts `value`, given as the text you send to PostgreSQL.
 * `float` says the column (or its domain's base type) is `float8`.
 */
export function accepts(rule: Rule, value: string | null, float = false): boolean {
  if (value === null) {
    return rule.kind !== 'notNull'; // a CHECK passes on null
  }
  switch (rule.kind) {
    case 'notNull':
      return true;
    case 'length': {
      const length = Array.from(value).length; // code points, as char_length counts
      return (rule.min === null || length >= rule.min) && (rule.max === null || length <= rule.max);
    }
    case 'range': {
      const compare = (a: string, b: string): number =>
        float ? Math.sign(Number(a) - Number(b)) : compareDecimals(a, b);
      return (
        (rule.min === null || satisfies(compare(value, rule.min.value), rule.min)) &&
        (rule.max === null || satisfies(compare(rule.max.value, value), rule.max))
      );
    }
    case 'enum':
      return rule.values.includes(value);
    case 'pattern':
      return new RegExp(rule.source, rule.flags).test(value);
  }
}
```

- **Count code points.** `char_length` counts code points, which `Array.from(value).length` gives;
  `value.length` counts UTF-16 units, so an emoji counts twice.
- **Compare bounds exactly.** Bounds are decimal strings so that `int8` and `numeric` bounds keep
  every digit, and `Number('9007199254740993')` is off by one. Only for a `float8` column does
  PostgreSQL compare doubles, and there `Number(bound.value)` is the double it compares with.
- **Keep the pattern's flags.** Without `s`, `.` stops at a newline where PostgreSQL's does not;
  without `u`, an emoji counts as two characters. Like PostgreSQL's `~`, a pattern matches anywhere
  in the value unless `^` and `$` anchor it.
- **Let null through.** A CHECK passes when its expression is null, so every rule but `notNull`
  accepts a missing value; whether the column takes null is its `nullable`.
- **Test the value PostgreSQL will store.** Rules apply after input conversion and type modifiers: a
  `numeric(5, 2)` column stores `99.995` as `100.00` before its CHECK runs, so round to the column's
  `scale` before testing a range.

## `toPublicCatalog(catalog, tables)`

Returns the slice a browser may see: only the listed tables, and of them only what a form needs:
types, nullability, the default's `literal`, identity, generation kind, and constraints with their
columns and rules. Expressions, definitions, comments, collations, indexes, and row security are
dropped, but a unique index that no constraint backs follows the constraints as a unique one, keyed
by its name, since PostgreSQL reports its violation the same way. Every unique constraint carries
`partial`, true when a `WHERE` clause limits the rule to some rows; a unique index over an
expression stays out. Every CHECK and foreign key carries `enforced`, false when the constraint is
NOT ENFORCED (PostgreSQL 18), which the database records but never checks. `enums` and `domains`
keep exactly the ones the kept columns use, through domains over domains. A table the catalog does
not hold, or a table listed twice, throws `TypeError` naming it.

```ts
const tools = toPublicCatalog(catalog, ['tools']).tables['tools'];
tools?.constraints['tools_org_name_unique'];
// { kind: 'unique', columns: ['organization_id', 'name'], nullsDistinct: true, partial: true }
// from: create unique index tools_org_name_unique on tools (organization_id, name)
//         where organization_id is not null;
```

- **Leave a partial rule to the database.** A unique constraint with `partial: true` holds only
  among the rows its private predicate selects, so a client cannot tell whether a value breaks it;
  check it on the server, or by the error it raises.
- **Skip what the database does not enforce.** A CHECK or foreign key with `enforced: false` never
  raises an error, and the table may hold rows that break it, so a form that applies it refuses
  values the database stores. Its `rule` is always `null`. To make clients see the rule, enforce it
  in the database: `ALTER TABLE ... ALTER CONSTRAINT ... ENFORCED` for a foreign key, and for a
  CHECK, drop it and add it again without `NOT ENFORCED`; then extract the catalog again.

```ts
const imports = toPublicCatalog(catalog, ['imports']).tables['imports'];
imports?.constraints['imports_status_check'];
// { kind: 'check', columns: ['status'], rule: null, enforced: false }
// from: status text constraint imports_status_check
//         check (status in ('active', 'archived')) not enforced
```

## `diffCatalogs(expected, actual)`

Compares two catalogs member by member and returns `{ changes }`, depth first:

```ts
{ kind: 'added', path: ['tables', 'contacts', 'columns', 'notes'], actual: { ... } }
{ kind: 'removed', path: ['tables', 'contacts', 'rowSecurity', 'policies', 'tenant'], expected: { ... } }
{ kind: 'changed', path: ['enums', 'contact_kind'], expected: ['person', 'company'], actual: ['person', 'company', 'team'] }
```

Objects recurse; arrays and scalars compare as whole values. An empty list means the catalogs are
equal, whatever the order of their members. Catalogs of different `format` throw `TypeError`.

## `toCamelCase(text, options?)` and `toSnakeCase(text, options?)`

Kysely's `CamelCasePlugin` conversions, ported line by line and tested against the plugin, so a key
computed from the catalog is the key the plugin produces at runtime:

```ts
import { toCamelCase, toSnakeCase } from '@nizam-os/catalog-core';

toCamelCase('created_at'); // 'createdAt'
toCamelCase('address_line_1'); // 'addressLine1'
toSnakeCase('addressLine1'); // 'address_line1': not the column, so this name does not round-trip
toSnakeCase('addressLine1', { underscoreBeforeDigits: true }); // 'address_line_1'
```

The options are the plugin's `upperCase`, `underscoreBeforeDigits`, and
`underscoreBetweenUppercaseLetters`; pass the ones your application gives the plugin. Characters are
read as UTF-16 code units, as the plugin reads them. `@nizam-os/pg-catalog` uses both for its
`camelCase` Kysely types, and `@nizam-os/resource-core` uses `toCamelCase` for public field names.

## Versioning

`CATALOG_FORMAT` is the shape of the model. A release that changes the shape increments it and is a
major release; a catalog of another format is not comparable, and `@nizam-os/pg-catalog` asks you to
extract again.

## License

MIT
