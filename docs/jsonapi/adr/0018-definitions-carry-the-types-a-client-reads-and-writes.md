# ADR 0018: Definitions carry the types a client reads and writes

- Status: accepted
- Date: 2026-10-12

## Context

A client typed by the server's definitions (ADR 0017) needs what a definition's type parameters do
not record. `ResourceDefinition` keeps the names: the type, the attribute and relationship names,
the sort and filter names, and the validators' outputs. The values of a served attribute are erased
(`serialize` returns `Partial<Record<TAttribute, unknown>>`); a relationship's target type and
cardinality are widened to `string` and `Cardinality`; a filter's operators, the include paths, the
search parameter, whether the resource paginates, the writable fields, and `clientIds` are not
recorded; and the validators' input, what a client sends, is erased behind
`StandardSchema<unknown, TCreate>`. TypeScript cannot recover a literal type from a widened one, so
a client can only get them where the definition is written.

The alternatives:

1. A client-side schema written next to the definitions: two declarations of one resource, which is
   what ADR 0012 and the family's first principle rule out.
2. Types generated from an OpenAPI document: a build step, and a document `@nizam-os/jsonapi-core`
   does not produce (`@nizam-os/resource-core` does, for declared resources).
3. Inference from the server's code at definition time, as Hono's RPC client infers responses from
   routes and tRPC infers procedures from a router: the types follow every edit with no step in
   between.

A type-only member has precedents. Standard Schema V1 carries `types?: { input, output }` on every
schema, absent at runtime, for libraries to infer from. `@nizam-os/resource-core` carries
`'~context'` on declared resources for its type helpers. @ref
https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts (`types`:
"Inferred types associated with the schema.") @ref https://hono.dev/docs/guides/rpc @ref
https://trpc.io/docs/client/vanilla/infer-types

## Decision

- `ResourceDefinition` takes a ninth type parameter, `TTypes extends ResourceTypes`, defaulting to
  the wide `ResourceTypes`, carried as `'~types'?: TTypes`, always `undefined` at runtime. Existing
  references with eight arguments keep their meaning, and `AnyResource` accepts every definition,
  since the member is read-only and every inferred `TTypes` is assignable to the wide one.
- `defineResource` and a configured definer infer it from the init (SPEC 5.3): the attributes
  `serialize` returns, as JSON; the relationships as declared, literal; the filter operators, the
  include paths, the search parameter, the page capability, and the custom names; the validators'
  input types; the writable lists; and `clientIds`.
- Attributes are typed as the JSON a client receives (`JsonOf`): `JSON.stringify` writes a `Date`
  through `toJSON`, drops a member whose value is `undefined`, and has no form for a bigint, a
  function, or a symbol. The JSON is the contract, not the row: a row's `Date` reaches a client as a
  string.
- `serialize`'s check is unchanged: an attribute or relationship it returns that the definition does
  not declare is a type error on `serialize`, as before.
- `@nizam-os/resource-core`'s `ResourceOf` fills `TTypes` from the declaration, whose read types are
  already wire forms, so declared resources type their clients the same way.

## Consequences

A client knows a resource's attributes, relationships, and query from the definition alone, and an
edit to `serialize` or a validator changes the client's types in the same type check.
`defineResource` has more type parameters to infer; the inference is local to its call and the
member is computed only where a client reads it, so a server that never reads `'~types'` pays for
the inference only. `JsonOf` follows `JSON.stringify`'s rules for the values a row usually holds; a
class with its own `toJSON` is typed by that method's return type. A `serialize` that returns
attributes typed as `unknown` (from a dynamic source) gives a client `unknown`, the honest answer.
