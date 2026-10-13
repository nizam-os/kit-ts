# ADR 0011: An id takes what its key's write form takes and is sent in the spelling the server reads back

- Status: accepted
- Date: 2026-10-11

## Context

JSON:API ids are strings, and a client that holds two of them can only compare their texts. The
first id form (#87) took the key's write form (SPEC 5.1), and ADR 0005 lets a write form take
several spellings of one value, the normalizations PostgreSQL makes without changing the value. A
URL's id or a client id in such a spelling named an existing key, while the server sent that key
back in PostgreSQL's spelling. An oracle that stored candidate ids in the key columns of the stern
and GitLab schemas and of a schema with every key type, on PostgreSQL 14 and PGlite's 18, and read
them back found ids the form took as themselves that came back as other text (#90). The cases:

- `uuid` in upper or mixed case, which reads back in lower case. RFC 9562 says "the alphabetic
  characters may be all uppercase, all lowercase, or mixed case", and clients print both: Swift's
  `UUID().uuidString` gives upper case, Web Crypto's `crypto.randomUUID()` lower.
- `timestamp` with a lower-case `t` or zeros at the end of the fraction, and `timestamptz` with an
  offset, which read back with `T`, the shortest fraction, and in UTC.
- `numeric(p, s)` with fewer than s fraction digits, which reads back with s; `bpchar(n)` shorter
  than n, which reads back padded.
- `real`, whose write form takes any number that rounds to a finite `float4`, while PostgreSQL
  prints the shortest decimal that reads back as the same `float4`: `0.30000000000000004` reads back
  as `0.3` and `16777217` as `16777216`. PostgreSQL's `float4out` is Ryu with the bounds of the
  rounding interval excluded (`STRICTLY_SHORTEST` is 0), so a decimal exactly between two floats is
  never printed.

Three types compare more coarsely than any spelling: `citext` ignores case, a `numeric` without a
scale keeps the scale it was given while `1 = 1.0`, and an unbounded `bpchar` ignores trailing
spaces. There, two texts that read back differently can still name one key.

@ref https://www.rfc-editor.org/rfc/rfc9562#section-4 @ref
https://jsonapi.org/format/1.1/#document-resource-object-identification @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/common/f2s.c @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/common/ryu_common.h @ref
https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-FLOAT @ref
https://www.postgresql.org/docs/18/datatype-character.html @ref
https://www.postgresql.org/docs/18/citext.html @ref
https://developer.apple.com/documentation/foundation/uuid/uuidstring @ref
https://w3c.github.io/webcrypto/#Crypto-method-randomUUID

## Decision

- `schema.id` takes exactly what the key's write form takes, so a client may send any spelling a
  write of the same column accepts, a UUID in upper case included, as RFC 9562 allows.
- It outputs the id the server sends for the value, its read form (SPEC 5.1): a `uuid` in lower
  case, a `timestamp` with `T` and its fraction without trailing zeros, a `timestamptz` in UTC with
  `Z`, a `numeric(p, s)` with s fraction digits, a `bpchar(n)` padded to n code points, and a `real`
  as `float4out` prints it (`realText`, a port of its shortest-digit search). The output is taken as
  itself, so parsing an id twice changes nothing.
- A `citext` key, a `numeric` key without a scale, and an unbounded `bpchar` key keep the text sent:
  no spelling is the value's, so such ids compare in PostgreSQL. The SPEC and the README say so.
- A runtime looks a URL's id up as `schema.id` outputs it and passes that on.
  `@nizam-os/jsonapi-core` matches an update's document id to the URL's by `validate.id`'s output,
  so a client that requests `/contacts/ABC…` and sends back the document the server gave it, with
  `abc…`, is no conflict; `validate.id` therefore serves every resource, not only one with client
  ids.
- The metadata and the OpenAPI document are unchanged: the texts accepted did not change.

## Consequences

Every id the server sends compares as text with every other, but for the coarse types, and two ids
it outputs differently name two keys (`e2e/resource/id-spellings.e2e.test.ts`, on PGlite and
PostgreSQL 14 and 18). Clients and caches that key by id see one id per row. `realText` matched
PostgreSQL's output, read as a number as a driver reads it, for a million floats (each exponent's
edges, the subnormals nearest zero, and random bit patterns) on PostgreSQL 14 and PGlite's 18, and
for every float of two binades on PGlite, the subnormals and [2^25, 2^26), where a midpoint between
two floats is an integer, 16.8 million in all. It follows `float4out` at the default
`extra_float_digits` of 1; a session that lowers it reads rounded `real` values, ids included, which
no form can match. A key type whose read form gains a new spelling, or a new type with one, needs
its read form in `id-schema.ts` and its candidates in `support/id-candidates.ts`, and the
id-spellings suite fails until both exist. @ref
https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-EXTRA-FLOAT-DIGITS
