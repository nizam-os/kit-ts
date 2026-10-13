# ADR 0020: A selection's writes fan out over the per-id endpoints; rows that commit together belong to one aggregate

- Status: accepted; supersedes the bulk-write half of ADR 0019 (the action model stands)
- Date: 2026-10-13

## Context

ADR 0019 chose one Atomic Operations request for a selection, whole or not at all, each refusal
pointed at the operation it names. Since then the suite's API contract fixed the public API to the
flat style, which has no operations endpoint, and settled bulk writes the other way, following the
platform's dashboard blueprint:

- A write to several resources is a fan-out over the per-id endpoints, one request per resource,
  at most 100 per action, with a per-id outcome `{ succeeded, failed: [{ id, code, message }] }`.
- Rows that must commit together are members of one aggregate, and that aggregate's own endpoint
  takes them in one request. The transaction boundary is the aggregate's, never a generic batch's.

The reasons recorded in the contract: one authorization path per endpoint, one transaction boundary
per aggregate, and a partial outcome reported per row, since each row has its own permissions and
its own conflicts. The "all or nothing" ADR 0019 promised for a selection across aggregates was
the wrong promise: it required a second authorization path and a transaction that spans modules.

@ref https://jsonapi.org/ext/atomic/#processing (what is given up)

## Decision

- **The model of ADR 0019 stands.** `recordActions` and `bulkActions` keep their parts: texts as
  message functions, tone, confirmation, `state(target)` with `visible`, `disabled` and `reason`,
  `done({ count })`, and no state of their own.
- **A selection fans out.** A bulk action's `requests(ids)` are one `update` or `remove` mutation
  per id, the ones `resourceQueries` builds, sent in parallel by the query binding; `operations(ids)`
  and `operationsMutation` go. The cap is the contract's 100 ids per action, and `state` disables
  the action beyond it with `tooMany({ max })`, as before.
- **The outcome is per id.** The binding resolves to `{ succeeded, failed: [{ id, error }] }`;
  `errors(result)` places each refusal on the record it names, as ADR 0019 placed an operation's,
  and `done` reports the committed count. A partial outcome is reported, never rolled back.
- **Rows that commit together are one resource.** A screen that must save several rows at once
  edits the aggregate that owns them through its update form (SPEC 20.3): the rows are a member of
  that resource, and its endpoint is the transaction.
- **Until the binding under the contract lands, the shipped code stands.** The operations
  endpoint, `operationsOf`, `atomic.max` and the JSON:API transport leave with the JSON:API packages
  under ADR-0012; SPEC section 21 describes the shipped behaviour until then.

## Consequences

A bulk action needs no server surface beyond the per-id endpoints, so it works against any server
of the contract, hand-written or declared. A selection of 100 spends 100 requests of the write quota
and finishes in the time of the slowest of its parallel requests. A refusal still lands on its row;
what changes is that the other rows stay committed, and the screen says how many did. The jsonapi
family's Atomic Operations (jsonapi ADR 0022, 0023) have no consumer left in the resource family.
