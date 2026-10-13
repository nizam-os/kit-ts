/**
 * Shared constants. Every value here is named in `docs/jsonapi/SPEC.md` section 13.
 * @packageDocumentation
 */

/**
 * The JSON:API media type. The only media type parameters the specification
 * allows on it are `ext` and `profile`.
 * @ref https://jsonapi.org/format/1.1/#jsonapi-media-type
 * @ref https://jsonapi.org/format/1.1/#media-type-parameters
 */
export const JSON_API_MEDIA_TYPE = 'application/vnd.api+json';

/**
 * The highest specification version this package implements, advertised in
 * the `jsonapi` object of every document it builds.
 * @ref https://jsonapi.org/format/1.1/#document-jsonapi-object
 */
export const JSON_API_VERSION = '1.1';

/**
 * URI of the Atomic Operations extension and its namespace.
 * @ref https://jsonapi.org/ext/atomic/
 */
export const ATOMIC_OPERATIONS_EXTENSION = 'https://jsonapi.org/ext/atomic';

/**
 * URI of the Cursor Pagination profile exactly as its page states it ("The url
 * for this profile is http://jsonapi.org/profiles/ethanresnick/cursor-pagination/"),
 * `http` and trailing slash included. Its error type links use `https`
 * (`CURSOR_PAGINATION_ERROR_BASE`); both are copied verbatim from the page.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
export const CURSOR_PAGINATION_PROFILE =
  'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/';
const CURSOR_PAGINATION_ERROR_BASE =
  'https://jsonapi.org/profiles/ethanresnick/cursor-pagination';

/** The profile's error type URIs, rendered as `links.type` (SPEC 8.4). */
export const UNSUPPORTED_SORT_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/unsupported-sort`;
export const MAX_SIZE_EXCEEDED_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/max-size-exceeded`;
export const RANGE_PAGINATION_NOT_SUPPORTED_TYPE: string = `${CURSOR_PAGINATION_ERROR_BASE}/range-pagination-not-supported`;

/**
 * Member names: at least one character, starting and ending with a letter,
 * digit, or a code point at U+0080 or above, with `-`, `_`, and space allowed
 * in between. The reserved characters are excluded by construction.
 * @ref https://jsonapi.org/format/1.1/#document-member-names
 * @ref https://jsonapi.org/format/1.1/#document-member-names-allowed-characters
 */
export const MEMBER_NAME_PATTERN: RegExp =
  /^[A-Za-z0-9\u0080-\u{10FFFF}](?:[A-Za-z0-9\u0080-\u{10FFFF} _-]*[A-Za-z0-9\u0080-\u{10FFFF}])?$/u;

/**
 * An extension namespace: one or more of a-z, A-Z, 0-9.
 * @ref https://jsonapi.org/format/1.1/#extension-rules
 */
export const EXTENSION_NAMESPACE_PATTERN: RegExp = /^[A-Za-z0-9]+$/u;

/**
 * `page[size]` MUST be a positive integer matching this pattern; anything
 * else ("1e2", "0x10", " 5", "-1") is an invalid parameter error.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ (page[size]: "MUST match ^[0-9]+$")
 */
export const PAGE_SIZE_PATTERN: RegExp = /^[0-9]+$/u;

/**
 * Request text an error detail may quote (ADR 0016): letters, digits, `_`,
 * `-`, `.`, and the square brackets of a query parameter family, at most 64
 * characters. A member name, a member path, a parameter name such as
 * `page[size]`, an integer, or a UUID passes; a quote, markup, whitespace, a
 * control character, a URL, or a long text does not. The same character
 * set as the request id `@nizam-os/ban-core` echoes (ban ADR 0007), with the
 * brackets added and a shorter bound.
 * @ref https://jsonapi.org/format/1.1/#query-parameters-families
 */
export const QUOTABLE_PATTERN: RegExp = /^[A-Za-z0-9_.[\]-]{1,64}$/u;

/**
 * Property names that reach `Object.prototype` through an ordinary assignment
 * or lookup. Every parser that turns client input into object keys rejects
 * them; every lookup into a client-shaped object uses `Object.hasOwn`.
 */
export const PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/** Query parameter families the specification reserves. */
export const RESERVED_QUERY_FAMILIES: ReadonlySet<string> = new Set([
  'include',
  'fields',
  'sort',
  'page',
  'filter',
]);

/** The `page` family members the Cursor Pagination profile defines. */
export const CURSOR_PAGE_MEMBERS: ReadonlySet<string> = new Set([
  'size',
  'after',
  'before',
]);

/**
 * Default and upper bound for `page[size]` when a resource declares
 * pagination without its own numbers.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_MAX_PAGE_SIZE = 100;

/**
 * A definition's cap on the operations of one atomic request when it gives
 * none (`atomic.max`, SPEC 5.1). The same default as JsonApiDotNetCore's
 * `MaximumOperationsPerRequest`.
 * @ref https://www.jsonapi.net/usage/writing/bulk-batch-operations.html ("The maximum number of operations per request defaults to 10")
 */
export const DEFAULT_MAX_OPERATIONS = 10;

export const HTTP_BAD_REQUEST = 400;
export const HTTP_FORBIDDEN = 403;
export const HTTP_INTERNAL_SERVER_ERROR = 500;
