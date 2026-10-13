# ADR 0015: Cursors can be bound to a caller-supplied context

- Status: accepted
- Date: 2026-10-09

## Context

ADR 0006 binds a cursor to the sort, filter, and search it was issued for. A multi-tenant
application scopes every query to one organization in its `where` clause, outside the request, so
two organizations asking for the same page send identical requests. A cursor issued inside one is
then accepted inside the other: it can be replayed across scopes, and the seek values of one
tenant's row steer another tenant's query, skipping rows that tenant should see. The scope is the
server's knowledge, not the client's, and the adapter cannot read reliable values back out of an
arbitrary Kysely `where` clause. Issue #56; `@nizam-os/kysely-resource` will pass its scope values
here.

Two shapes were possible. A `context` member on the request would sit next to client input, and an
API layer that builds the request from query parameters wholesale would let the client choose it. An
option beside the request keeps it the server's. Values are scalars because a scope is a set of ids
and flags; canonical JSON (SPEC 2.4) already orders members, so the binding does not depend on the
order the caller wrote them in. @ref https://www.rfc-editor.org/rfc/rfc8785#section-3.2.3

The cursor format question: CONTRIBUTING requires a version bump for a payload change. The payload
`{ v, k, c, t }` does not change here, only what `c` hashes when a context is given. Hashing the
context as an extra member only when present leaves the hash of every request without a context
exactly as before, so no existing cursor is misread or invalidated, and a cursor bound to a context
can never match a request without one.

## Decision

- `plan(request, { context })` and `paginate(query, request, { context })` take a `context`: a plain
  object of named strings, finite numbers, bigints (bound as their decimal text), booleans, or
  `null`. The planner checks it before the request and throws `TypeError` naming the member for
  anything else: a non-plain object, `undefined`, `NaN` or an infinity (JSON writes them as `null`),
  nested values, or a prototype key as a name.
- The context hash becomes the canonical JSON of `{ sort, filter, search, context }`, where
  `context` is present only when the caller's context has members. An empty or absent context binds
  nothing, and a mismatch is rejected with reason `context`, as for a foreign sort.
- `CURSOR_VERSION` stays 1.

## Consequences

An application passes the same values to the scope of its query and to `context`, and a cursor then
resumes only inside the scope that issued it. Binding fails closed: an endpoint that forgets the
context issues unbound cursors that scoped endpoints reject, and cursors issued before an
application adopts a context are rejected once it does, which is the intended effect. Applications
that never pass a context see no change. The context only binds cursors; scoping the rows remains
the query's job.
