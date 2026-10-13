# ADR 0020: Schemas document titles as localizable strings

- Status: accepted
- Date: 2026-10-11

## Context

ADR 0011 kept `code` and `title` out of the per-call options so that a body never contradicts the
schema its route documents, and every built-in format pinned `status`, `code`, and `title` with
`const` (a single-value `enum` in the OpenAPI 3.0 dialect). The same ADR named the handler's
`transform` as the home of localization, "explicitly outside the schema".

Those two decisions disagree. RFC 9457 lets a title change between occurrences "except for
localization (e.g., using proactive content negotiation; see Section 12.5.1 of [HTTP])" (section
3.1.3), and `transform` is where a host makes that change: `@nizam-os/resource-core`'s
`localizeErrors` replaces each title and detail with the request's language. Every localized body
then failed the schema of the response its route documented. The contacts application in
`e2e/resource` showed it over HTTP: a German 409 answered
`/errors/0/title must be equal to constant` against the served OpenAPI document (#113).

`status` and `code` identify an entry: a catalog's codes are unique, and a status is fixed per code.
A title says the same thing in words, so pinning it adds nothing a client can act on, and it is the
one member RFC 9457 lets vary. JSON Schema 2020-12 states sample values with `examples`, an array
(validation vocabulary section 9.5), which OpenAPI 3.1 prefers to its deprecated `example`; an
OpenAPI 3.0 Schema Object has `example` and no `examples`. @ref
https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3 @ref
https://json-schema.org/draft/2020-12/json-schema-validation#section-9.5 @ref
https://spec.openapis.org/oas/v3.0.4.html#fixed-fields-20

## Decision

- A built-in schema documents `title` with `localizable(value, dialect)` from `schema-helpers.ts`:
  `{ type: 'string', examples: [value] }`, or `{ type: 'string', example: value }` in the OpenAPI
  3.0 dialect, where `value` is the catalog's title. Problem Details, JSON:API (every object,
  including the objects of a document that combines entries), and plain do so; Google API and Stripe
  already documented their messages as strings.
- `status` and `code` stay pinned with `constant()`, so every entry's schema still refuses another
  entry's body.
- The rest of ADR 0011 stands: `code` and `title` come from the catalog entry only, and a different
  title is a different entry or `ban.custom()`. Localization stays the handler's `transform`.

## Consequences

- A body whose titles `transform` localized matches the response its route documents, in every
  format and both dialects; `src/formats/localized-titles.test.ts` and
  `e2e/ban/openapi-localized.e2e.test.ts` prove it, the latter against documents served over HTTP.
- Client generators no longer see a title as a literal type. They still see `status` and `code` as
  literals, which is what they discriminate on.
- A client that recognized an error by its title must use `code`, which the schema still pins.
- ADR 0011 is superseded in part: its pinned `title`.
