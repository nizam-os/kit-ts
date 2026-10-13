# ADR 0022: Atomic Operations are values built from definitions and sent through the transport in one request

- Status: accepted
- Date: 2026-10-12

## Context

The server processes the Atomic Operations extension (ADR 0010, SPEC 11), and the client has no call
for it (SPEC 15.1): an application writes `fetch` with the extension's media type itself and reads
`atomic:results` by hand. A screen that changes a selection of records needs it. One request per
record, the client's single calls, leaves part of the selection changed when one fails; the
extension commits all or nothing ("a failure to perform any operation MUST invalidate any effects of
preceding operations"), keeps the results in operation order, and asks a server to point each error
at the operation that failed.

What the extension and the base specification ask of a client:

- The request is a `POST`. A client that applies an extension "MUST specify the `ext` media type
  parameter in the `Content-Type` header", and "MAY use the `ext` media type parameter in an
  `Accept` header to require that a server apply all the specified extensions to the response
  document"; every example of the extension sends both.
- The response is `200` with an `atomic:results` member as long as the operations, or `204` when
  every result is empty. A document "MUST contain at least one of" `data`, `errors`, `meta`, or "a
  member defined by an applied extension", so a results document holds no `data`.
- A result holds a created or updated resource as `data`, or no `data`; the results of a removal and
  of a relationship operation hold none. A results document holds no `included`.
- An operation targets with `ref` (`type` and `id`, or `type` and `lid`, and an optional
  `relationship`) or `href`. A `lid` names a resource an earlier `add` of the request created, in
  its `data` and in the linkage of later operations.

Each write the client sends already has an operation's form: an update's `PATCH` document holds the
resource object an `update` operation holds as `data` (SPEC 15.4), a relationship call's document
the linkage a relationship operation holds, and a removal needs only its target. A record without
included resources needs no definition but its own (SPEC 15.6). The contacts application, measured
on 2026-10-12, answers a refused operation at its index and rolls every operation back: `409` at
`/atomic:operations/1/data/attributes/email`, `403` at `/atomic:operations/1`, and `404` at
`/atomic:operations/0` (`e2e/resource/runtime-operations.e2e.test.ts`).

@ref https://jsonapi.org/ext/atomic/#processing @ref
https://jsonapi.org/ext/atomic/#processing-errors @ref
https://jsonapi.org/ext/atomic/#operation-objects @ref
https://jsonapi.org/ext/atomic/#result-objects @ref
https://jsonapi.org/format/1.1/#content-negotiation-all @ref
https://jsonapi.org/format/1.1/#content-negotiation-clients @ref
https://jsonapi.org/format/1.1/#document-top-level

## Decision

- **Operations are values.** `operationsOf(definition)` returns, typed by the definition, a builder
  per write of the client: `create(input)`, `update(id, input)`, `remove(id)`,
  `setRelationship(id, name, linkage)`, `addToRelationship(id, name, linkage)`, and
  `removeFromRelationship(id, name, linkage)`, each taking what the call of its name takes and
  returning an `Operation` instead of sending: a frozen object holding the `definition`, the
  extension's `op`, the `ref`, and the `data`, the document the single call would send. The builders
  read the definition alone, so a model that holds a definition builds operations without a client.
- **Local identities link, ids target.** `create` takes a `lid`, and a relationship value may be
  `{ type, lid }`, naming a resource an earlier operation of the request creates. A target is an id:
  a resource the request creates is created with its relationships, so targeting it by its `lid`
  adds nothing a client building the request needs.
- **One call sends them.** `sendOperations(transport, operations, options?)` sends one `POST` to the
  definitions' operations path (ADR 0023) with `Content-Type` and `Accept` both
  `application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"`: the results are the extension's
  member, so the request requires the server to apply it. It resolves to the status, a result per
  operation in order, `{ data, meta }`, and the document's `links`, `meta`, and `jsonapi`. A
  create's or an update's `data` is the record of its operation's definition when the result holds
  one; every other result's `data` is `undefined`, and so is every result's after a `204`. Each
  result is held to its operation's shape, and a results list of another length is a `TypeError`, as
  a single call's data of another shape is.
- **A refusal names its operation.** A refused request rejects with the client's `ResponseError`,
  its error objects as the server sent them; `operationOf(errorObject)` reads the operation an
  object points at, `{ index, pointer }` from `/atomic:operations/<index><pointer>`, so a screen
  maps it to the record it wrote and, by the rest of the pointer, to the field.
- **Refused before sending.** `sendOperations` throws `TypeError` for no operations, for a value
  that is not an operation, and for operations whose definitions name different operations paths,
  since one request reaches one endpoint; like every call, it takes the paths alone and sends to the
  transport's origin (SPEC 15.2). It does not count them against the cap: the client checks nothing
  the server answers (ADR 0017), and the definitions carry the cap for the screens that read it (ADR
  0023).
- **The query binding.** `operationsMutation(transport, settings?)` in
  `@nizam-os/tanstack-query-jsonapi` gives mutation options whose `mutationFn` sends the operations
  and whose `onSuccess` removes the `get` entries of every record a removal removed, invalidates
  every type the operations write and the keys `settings.invalidates` names, and returns that
  promise, as the single writes do (SPEC 16.4); its types hold only the members it sets (ADR 0020).

## Consequences

A change to a selection is one request that commits or fails whole, and a refusal names the record
it is about. Operations are plain data a test compares and a model builds. The client reaches
operations only at `<base>/operations`, where `@nizam-os/hono-resource` serves them; a server that
mounts the endpoint elsewhere is called by hand, as one whose links `resourcePaths` cannot read is.
A result's record resolves no relationship, since the extension's results include nothing. A request
that updates or removes what it creates is written as the create.
