---
'@nizam-os/resource-core': minor
---

Declared resources carry Zod schemas derived from the catalog and the declaration, so clients and
servers refuse what PostgreSQL would refuse or store differently.

- `schema.read`, `schema.create`, and `schema.update` validate attributes by public name, and
  `linkage` holds the same three for relationships, each `{ type, id }`. `create` requires exactly
  the columns PostgreSQL requires on insert, `update` requires none, and `read` strips unknown keys,
  so clients keep working when a field is added. No schema fills in a default.
- A field's schema is its column's wire form, then its domain's rules, the CHECKs the catalog
  translates, its nullability, and its validators. The wire forms refuse excess fraction digits for
  `numeric(p, s)` and for `timestamp(p)` and `timestamptz(p)`, trailing spaces past `varchar(n)`,
  U+0000, unpaired surrogates, and other spellings of `int8` and `numeric` values, which travel as
  decimal strings.
- `validate.create` and `validate.update` are Standard Schema validators of the attributes, and
  `write.create` and `write.update` of a resource object as `@nizam-os/jsonapi-core` parses it, where
  the CHECKs over a field and a relationship run. Their issues are `ResourceIssue`s, named by a JSON
  Schema keyword from `ISSUE_KINDS` or by a constraint's code, with constant messages that never
  repeat request data.
- `tsc` checks that each validator accepts what its rule hands it: the field's value, `null`
  included for a nullable column, a relationship's id, or an object of them by public name; and that
  a domain's validator accepts every value of the domain. A domain rule may give `code`.
- `defineCodec` refuses a schema that accepts `undefined` or `null`: a member a client leaves out
  stays out, and the column's nullability decides `null`.
- `Infer<typeof Resource>` gives the output types of all six schemas, with enum columns and `enum`
  rules narrowed to their values.
- The new `@nizam-os/resource-core/testing` entry exports `boundaryFixtures(resource)`: labeled wire
  values at and next to every limit of each field and relationship, which the package's own tests
  run through PostgreSQL 14 and 18.
