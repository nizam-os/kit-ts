/**
 * The members of `filter` a declared resource's JSON:API definition gives
 * a meaning of its own (SPEC 3.7, 11.1), which no filtered member may take:
 * `@nizam-os/jsonapi-core` refuses a filter field named after either.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (sections 5.2 and 6.8)
 * @packageDocumentation
 */

/** The member of the search parameter, `filter[q]`, of a declaration with `search`. */
export const SEARCH_MEMBER = 'q';

/** The search parameter of a declaration with `search`, as clients send it (SPEC 3.7). */
export const SEARCH_PARAMETER: `filter[${typeof SEARCH_MEMBER}]` =
  `filter[${SEARCH_MEMBER}]` as const;

/** The member that groups conditions into a disjunction, `filter[or][n]` (jsonapi SPEC 6.8). */
export const FILTER_OR_MEMBER = 'or';
