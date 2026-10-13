---
'@nizam-os/resource-core': minor
---

`defineCodec` and `defineValidator` declare the values a definer's `codecs` and `validators` hold.

- `defineCodec({ types, schema, fixtures, description })` is the public facet of a column type that
  has no wire form, such as `tstzrange`, `bytea`, or pgvector's `vector`.
  `defineValidator({ schema, fixtures: { accept, reject }, description })` is the twin of a CHECK
  the catalog cannot translate; for a CHECK over several columns its input is an object of the
  members by public name, each relationship as its id.
- Fixtures are mandatory: without them, with an empty list, or with a value of another type the call
  does not compile. When the module loads, the schema must accept every fixture, and a validator's
  schema must reject every `reject` fixture; a disagreement throws a `TypeError` naming the fixture.
- Schemas come from `zod` or `zod/mini`, 4.5 or later, a new peer dependency, and must parse
  synchronously.
- The definer takes only values these functions returned: a codec or validator written by hand fails
  `tsc` and throws at startup.
- `StorageCodecs<typeof codecs, TStored>` types the storage facet an adapter implements, one `read`
  and `write` per codec.
