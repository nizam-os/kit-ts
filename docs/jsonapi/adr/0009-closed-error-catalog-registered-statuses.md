# ADR 0009: A closed error catalog over registered status codes

- Status: accepted; construction and status derivation moved to @nizam-os/ban-core by ADR-0014
  (`ERROR_CATALOG` is a fragment over @nizam-os/ban-core's built-in catalog, `responseStatus` is
  @nizam-os/ban-core's, and the registered status check is @nizam-os/ban-core's)
- Date: 2026-10-08

## Context

JSON:API error objects carry `status` as a string, `code` as an application-specific identifier, and
`title` that "SHOULD NOT change from occurrence to occurrence". The response status is "the most
generally applicable HTTP error code" for the errors in the document. Hono's response helpers type
their status argument as the registered codes, so an arbitrary number needs assertions. @ref
https://jsonapi.org/format/1.1/#error-objects @ref https://jsonapi.org/format/1.1/#errors-processing
@ref https://www.rfc-editor.org/rfc/rfc9110#section-15 @ref
https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml

## Decision

`ERROR_CATALOG` is closed: fifteen codes, each fixing `status` and `title`; every error object the
package emits uses one of them, and `ERROR_CODES` lists them for clients and documentation. A
`JsonApiError` derives its status from its objects (common status, else 400 when all are 4xx,
else 500) and accepts an explicit override only when it is a registered 4xx or 5xx code; an
unregistered code throws `TypeError` at construction. The reason phrases of the registry are used as
titles when Hono's `HTTPException` is rendered.

Applications with their own error vocabulary build error objects with `errorObject` from the catalog
or construct `JsonApiError` with their own objects; the `code` member is theirs to choose, the
status is still checked.

## Consequences

Clients can enumerate every `code` the package can emit. The status type lines up with Hono's
without assertions. Adding a code is a `minor` change to the catalog and the SPEC table.
