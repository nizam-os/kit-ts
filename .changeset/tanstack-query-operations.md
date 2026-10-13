---
'@nizam-os/tanstack-query-jsonapi': minor
---

Send Atomic Operations as one mutation. `operationsMutation(transport, settings?)` returns mutation
options, typed `OperationsOptions`, whose `mutationFn` sends the operations `operationsOf` builds
with `sendOperations`, under the `mutationKey` `['operations']`. On success it removes the `get`
entries of every record a removal removed, then invalidates every type the operations write and each
key `invalidates` names, and stays pending until the reads a screen shows have refetched, as the
single writes do; a refused request invalidates nothing. The operations are any operation by
default, each result's data `unknown`, and a type argument narrows them. `invalidates` that is not a
list of query keys throws `TypeError`.
