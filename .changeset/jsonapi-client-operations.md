---
'@nizam-os/jsonapi-client': minor
---

Send writes that must commit together in one Atomic Operations request. `operationsOf(definition)`
builds each write as an operation, each builder taking what the call of its name takes: a `create`
takes a `lid`, and a relationship value may be a `LocalIdentifier`, `{ type, lid }`, naming a
resource an earlier operation of the request creates.
`sendOperations(transport, operations, options?)` sends them in one `POST` to the definitions'
operations path under the extension's media type and resolves to a result per operation, a tuple
typed per operation for a list written in the call; a 204 gives every result empty, and a refusal
rejects with `ResponseError`, the server having stored none. `operationOf(errorObject)` reads the
operation an error points at and the pointer within it. A transport `createTransport` did not make,
an empty list, a value that is not an operation, and operations whose definitions name different
operations paths throw `TypeError` before anything is sent.
