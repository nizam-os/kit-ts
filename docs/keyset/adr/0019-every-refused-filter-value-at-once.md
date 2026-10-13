# ADR 0019: The planner reports every refused filter value at once

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0010 gave `InvalidFilterValueError` the `field`, `operator`, and `expected` of one condition, so
the planner threw at the first value a field's type refused (ADR 0005), and a client heard of the
next bad value only after fixing the first. The other request problems that can concern several
items are reported together: `UnsupportedSortError` lists every refused sort item (SPEC 5), and
`@nizam-os/jsonapi-core`'s `parseQuery` reports one error object per parameter it refuses. Measured
over HTTP on the contacts resource of the resource end-to-end suite: `filter[nickname]=x`,
`page[size]=0`, and `sort=bogus` in one query answered 400 with three error objects, while
`filter[priority][gte]=high`, `filter[createdAt][lt]=yesterday`, and `filter[status]=gone` answered
with one, at `filter[priority][gte]`. JSON:API leaves the choice to the server: "A server MAY choose
to stop processing as soon as a problem is encountered, or it MAY continue processing and encounter
multiple problems." @ref https://jsonapi.org/format/1.1/#errors-processing

## Decision

- `InvalidFilterValueError` carries `values`: one `InvalidFilterValue` (`field`, `operator`,
  `expected`) per condition whose value its field's type refuses, in the order of the request's
  conditions (a depth-first walk of the tree). It replaces ADR 0010's single `field`, `operator`,
  and `expected`. The message stays constant.
- Each entry also carries the condition's `path`: member names and array indexes from the root, as
  `InvalidFilterError`'s `path` gives a node's. `field` and `operator` say what was refused, but not
  where: one field and operator can appear in several conditions, and an API layer that built the
  tree from its own grammar finds by the path the parameter each condition came in.
- A condition appears once, with the first form its value fails: a list with several bad items is
  one entry, since an API layer addresses a condition, not an item of its value.
- The filter's structure is checked before its values. A node that is not one of the five shapes
  (`InvalidFilterError`), or a field or operator the definition does not have
  (`UnsupportedFilterError`), is thrown where the walk meets it, alone, whatever values were refused
  before it. Only a well-formed filter on declared fields and operators can end in
  `InvalidFilterValueError`.
- The planner's order of checks (SPEC 6.1) is unchanged: a refused sort is still reported before the
  filter, and the filter before the search and the page.

## Consequences

An API layer maps each entry to its own error object, as it maps `UnsupportedSortError`'s fields.
`@nizam-os/kysely-resource` answers one `INVALID_QUERY_PARAMETER` per entry, at the parameter the
entry's path leads to as the request spelled it (`filter[status]`, `filter[or][0][status]`), where
`@nizam-os/resource-core`'s `filterParameters` tells it, and at `filter[<field>][<operator>]`
otherwise (resource SPEC 18.5). The request above answers with three objects, the last at
`filter[status]`. Code that read `field`, `operator`, or `expected` from the error reads them from
each entry of `values`. `conditionPredicate` still throws for its one condition; `normalizeFilter`
gathers the refusals of every condition.
