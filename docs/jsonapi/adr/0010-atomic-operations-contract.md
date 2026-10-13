# ADR 0010: Atomic operations: caller-owned transaction, lid scope, two-phase processing

- Status: accepted; amended by ADR-0013 (`transaction(c, run)` is `transaction(ctx, run)`, the
  processor lives in `@nizam-os/jsonapi-core` as `operationsProcessor`, and "propagate to
  `app.onError`" reads "propagate to the host") and by ADR-0023 (the cap is the `atomic.max` the
  processor's definitions share, 10 by default, and `maxOperations` is no option)
- Date: 2026-10-08

## Context

The Atomic Operations extension requires that "the server MUST either completely succeed or
completely fail" and that results are returned in operation order; it defines `lid` for referring to
a resource created earlier in the same document, allows `ref` or `href` to target an operation, and
says errors should identify the failing operation. The package does not know the application's
database, so it cannot open a transaction itself. The previous implementation ran operations without
a shared transaction contract, required UUID ids, and pinned every failure to operation 0. @ref
https://jsonapi.org/ext/atomic/#processing @ref https://jsonapi.org/ext/atomic/#processing-errors
@ref https://jsonapi.org/ext/atomic/#operation-objects

## Decision

- The application supplies `transaction(c, run)`; it MUST call `run` once and MUST roll back when
  `run` rejects. The processor executes every operation inside `run` and lets any error escape it.
- Processing is two-phase: the whole document is parsed structurally first (every problem in one
  400, before any handler runs), then operations execute in order, each parsing its `data` against
  the targeted definition with `lid` allowed.
- `lid`s are scoped per resource type within one document, defined by an `add` whose handler
  returned the created row (or by the client-generated id), and resolvable only by later operations;
  a repeated or unknown `lid` is a 400 at the reference. A handler that returns nothing for an `add`
  with a `lid` is a programming error (`TypeError`).
- Handlers are declared per resource (`create`, `update`, `remove`,
  `relationships.<name>.{update,add,remove}`); a missing handler is a 403, an unknown type a 404.
  `add` and `remove` apply to to-many relationships only. `href` is accepted only through an
  application-supplied resolver.
- An error from an operation (a `BanError` since ADR-0014) gets the operation's pointer when its
  objects carry no `source`; other errors propagate to `app.onError` after the rollback. Results
  carry `data` only when a handler returned a row; when none did, the response is `204`.
- At most `maxOperations` (default 10, JsonApiDotNetCore's default) operations per request.

## Consequences

Any database with a transaction API works through one callback. Handlers never see a `lid`:
references are resolved before they run. Applications that need cross-type `lid`s or `href` targets
implement the resolver.
