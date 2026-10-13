# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-08

## Context

@nizam-os/hono-jsonapi replaces an internal JSON:API toolkit whose choices were made without a
written rationale, so later readers could not tell a specification clause from a product convention
from an accident, and the reasons were lost with the code. JSON:API leaves several choices to the
server (the filter grammar, page size bounds, the set of error codes); those choices have to be
visible to be reviewable.

## Decision

Every decision that affects the public API, a wire shape, a choice the specification leaves to the
server, the runtime support matrix, security defaults, or dependencies is recorded as an ADR in
`docs/jsonapi/adr/`, numbered sequentially, using `0000-template.md`. A decision is changed by
adding a new ADR that supersedes the old one, never by editing history. Pull requests that make such
a change link the ADR.

## Consequences

Reviewers can check code against a stated decision, and a server choice can be told apart from a
specification requirement. Contributors have a place to argue a change before writing it. The
overhead is one short file per decision.
