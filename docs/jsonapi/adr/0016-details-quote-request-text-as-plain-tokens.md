# ADR 0016: Error details quote request text only as a plain token

- Status: accepted
- Date: 2026-10-11

## Context

An error object's `detail` is "a human-readable explanation specific to this occurrence of the
problem", and the package's parsers wrote the occurrence in by quoting what the client sent: query
parameter names, sort and filter fields, operators, include paths, sparse fieldset types and fields,
`page[size]` text, document member names, types, ids, `lid`s, hrefs, and extension URIs. A detail
travels further than the response: clients show it to people, servers log it, and support tools
paste it. Quoted verbatim, request text puts markup in front of a user (content spoofing), line
breaks and control characters into a log (CWE-117), a URL into a message the user trusts, a bidi
override that reorders what is displayed, and kilobytes into every log line. Member names admit
every code point from U+0080 up and a space inside, so the member name grammar is no defense.
@nizam-os/ban-core echoes a client's request id only when it matches `^[A-Za-z0-9._-]{1,128}$` (ban
ADR 0007), and @nizam-os/keyset-core keeps its messages constant with the detail in fields (keyset
ADR 0010). @ref https://jsonapi.org/format/1.1/#error-objects @ref
https://jsonapi.org/format/1.1/#document-member-names-allowed-characters @ref
https://cwe.mitre.org/data/definitions/117.html @ref
https://owasp.org/www-community/attacks/Content_Spoofing

## Decision

- A detail quotes a text from the request only when it matches `QUOTABLE_PATTERN`,
  `^[A-Za-z0-9_.[\]-]{1,64}$`: letters, digits, `_`, `-`, `.`, and the square brackets of a query
  parameter family, at most 64 characters. A member name, a member path, a parameter name such as
  `page[size]`, an integer, and a UUID pass, so the usual mistake still shows:
  `Sort field "nme" is not supported by this endpoint`. The brackets and the shorter bound are the
  only departures from ban ADR 0007's set; brackets carry no markup, quoting, or line meaning.
- Otherwise the detail says what the value was without it:
  `A sort field is not supported by this endpoint`. `source.parameter` or `source.pointer` still
  locates it. A detail about two request values quotes both or neither.
- One function, `quotable`, decides, and every builder and parser goes through it. A value the
  server declared, such as a type a lookup matched or a declared field, is the server's text and is
  quoted as it is.
- An extension URI is never quoted: a URI has a scheme and a colon, and a detail carries no link.
- `source` is unchanged. JSON:API defines `source.parameter` as the parameter that caused the error
  and `source.pointer` as a JSON Pointer to the member, so both carry the request's names, escaped
  by JSON and by RFC 6901. They are for programs, and a client that shows them treats them as data.
  A rendered body over @nizam-os/ban-core's cap is replaced whole (ban ADR 0007).
- A validator's issue message is the application's text and stays the detail (SPEC 9.2). Messages
  from @nizam-os/resource-core and Zod 4.6 hold no value; Valibot 1.5's defaults quote the received
  value verbatim, so an application on Valibot gives its schemas messages of its own.
- A sweep test sends quotes, markup, CR LF, C0 and C1 controls, a URL, a bidi override, a line
  separator, an inner space, and 10 kB through every builder and parser that quotes. It checks that
  every detail is short printable ASCII without angle brackets and quotes none of it, and that a
  plain token reaching the same refusal is quoted.

## Consequences

The details of plain tokens are unchanged, except the unsupported extension's, which no longer
quotes the URI; codes, statuses, and sources are unchanged everywhere. A client that sends a member
name beyond ASCII, which JSON:API allows, reads the generic sentence for its own field. The rule
covers the package's details only: a detail an application writes with `jsonApiError` or `errorItem`
is its own, and the README asks it to name what was wrong and leave the value to `source`.
@nizam-os/resource-core's `localizeErrors` replaces these English details by code, so a localized
response never sees the request text either.
