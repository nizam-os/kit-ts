# Security Policy

## Supported versions

Only the latest minor release of the current major line of each package receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"), which reaches the maintainer directly.

Include the package and version, a description of the issue, and a minimal reproduction if you have
one. You will get an acknowledgement within seven days. Fixes ship as a patch release of the
affected package with a GitHub Security Advisory; reporters are credited unless they ask not to be.

## Scope

The packages parse untrusted requests and render responses: `@nizam-os/ban-core` and
`@nizam-os/hono-ban` render error responses; `@nizam-os/jsonapi-core` and `@nizam-os/hono-jsonapi`
parse request documents and query strings; `@nizam-os/keyset-core` turns sort, filter, search, page
parameters, and cursors into query plans, and `@nizam-os/kysely-keyset` and `@nizam-os/drizzle-keyset`
render those plans as SQL. Reports we care about most:

- server internals (stack traces, database detail, file paths, column values, driver detail)
  reaching a client response or an error message by default
- prototype pollution through member names, query parameter names, `lid` values, field, relation, or
  operator names, or user-supplied `meta` or extension members taken from a request
- header injection through error headers, `Location`, `Content-Type`, or `Vary`
- a request document or query string that bypasses a definition's declared fields, relationships,
  sort fields, filter operators, or page size bounds
- a cursor accepted without a valid signature, or a cursor issued under one sort, filter, or search
  accepted under another
- a request that makes a table, column, relation, or configuration name reach SQL unquoted, or a
  value reach SQL as anything but a bound parameter
- denial of service through pathological error payloads, documents, query strings, operation lists,
  filters, or cursors

What a cursor reveals is by design, not a vulnerability: a cursor is signed, not encrypted, and the
sort-key values of the row it points at can be read by anyone who holds it. Do not expose a sort
over a column whose values the client must not learn.
