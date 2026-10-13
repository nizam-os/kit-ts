# ADR 0015: The React bindings are a framework-free model under TanStack Query, Form, and Table

- Status: accepted; superseded in part by ADR-0016 (a form sends a cleared input as `null`, nullable
  or not), ADR-0017 (a refusal of several fields binds where a change to any of them clears it), and
  ADR-0018 (the model and the TanStack Form binding are two packages, `@nizam-os/resource-ui` and
  `@nizam-os/tanstack-form-resource`, and the TanStack Query binding is the jsonapi family's)
- Date: 2026-10-12

## Context

The epic sketched `useResourceForm`, a form hook with its own state, and `resourceQueries`. Before
building either, the bindings were measured against how the applications this family serves build
their screens:

- stern's web application builds every form on TanStack Form, through `createFormHook` with its own
  React Aria field components, lists on TanStack Query with `queryOptions` factories, and keeps each
  list's JSON:API query in the route's search, validated by `validateSearch`. Its forms restate what
  the declarations know: labels and option labels are literals, and every optional member is mapped
  by hand from `''` to `undefined` before the write.
- Another application's forms kit, also on TanStack Form, keeps every field's value as the string
  its input edits, resolves each validation rule to a sentence by its kind, shows one message per
  field, the first, and binds a rejected write's field errors onto the inputs, returning the ones it
  cannot place for a banner. Its data table keeps the list's state in the URL, drops the cursor on
  any change that is not navigation, since a cursor names a position under the old filter and sort,
  and pages only forward and back, since a cursor API has no total.

A form state of our own would compete with TanStack Form, which both applications use, and would
leave their field components unusable with it. TanStack Form validates a form with a Standard Schema
whose issue paths name the fields, and `revalidateLogic()` validates on submit first and on change
after. A field error set in `errorMap.onSubmit` is cleared by TanStack Form when the field is
validated again for another cause without an error, which is when its value changes. TanStack Table
v9 owns no data when its stages are manual: sorting and column filters are state,
`Array<{ id, desc }>` and `Array<{ id, value }>`, that the application feeds to its request.
TanStack Query keys must be serializable and unique to the data, and a mutation's `onSuccess`
receives the `QueryClient` (`context.client`, from 5.89).

The JSON:API query is already the family's language for a list: `serializeQuery` writes it,
`parseQuery` reads it against the definition, and the Cursor Pagination profile names the next and
previous pages by cursor. An error object's `source.pointer` (RFC 6901) names the member a refusal
is about, and the family points at `/data/attributes/<member>` and `/data/relationships/<member>`
(SPEC 9.3).

@ref https://tanstack.com/form/v1/docs/framework/react/guides/validation @ref
https://tanstack.com/form/v1/docs/framework/react/guides/form-composition @ref
https://tanstack.com/table/v9/docs/framework/react/guide/pagination @ref
https://tanstack.com/table/v9/docs/framework/react/guide/column-filtering @ref
https://tanstack.com/query/v5/docs/framework/react/guides/query-keys @ref
https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions @ref
https://jsonapi.org/format/1.1/#error-objects @ref https://www.rfc-editor.org/rfc/rfc6901 @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/

## Decision

- **A model, then bindings.** The root entry of `@nizam-os/react-resource` is a framework-free model
  of a declared resource: field descriptors, a form model, the error mapping, and a list model. It
  imports neither React nor TanStack. `./query` binds it to TanStack Query and `./form` to TanStack
  Form, each with its library as an optional peer. Tables take the list model's state as TanStack
  Table v9 reads it, so no Table import is needed and the application keeps its own table, columns,
  and markup.
- **Forms edit strings and send what changed.** A form value is what its input edits: a string for
  every text, number, date, and id, a relationship's whether its linkage or its included record
  holds it, a boolean or `null` until it is set for a boolean, a list for an array. A write carries
  the members whose value differs from the value the form started from: the declaration's display
  default or blank on create, the record's value on update, so a database default applies to every
  member the person left alone (ADR 0004). Values are turned into their wire forms by the field's
  metadata, and a blank becomes `null` where the member is nullable and is left out where it is not.
- **Validation is the declaration's.** The form's Standard Schema converts the values and runs
  `write.create` or `write.update`, places each issue on its member, keeps one per member, the
  first, and renders it with `localizeIssues` (ADR 0014); an issue on a blank value reads as
  `required`, since to the person filling the form, every rule an empty field fails says the same.
- **Server errors land by pointer.** An error object whose pointer names a member the form holds
  goes onto that field, its `detail` as the server localized it; the rest are the form's, for a
  banner. TanStack Form's binding writes them into `errorMap.onSubmit` and clears the previous ones.
- **A query key is the request.** `[type, call, ...]` with the query serialized by `serializeQuery`,
  so two queries that make one request share one cache entry and invalidating `[type]` reaches every
  list and record of the type; each write invalidates its type. `@nizam-os/jsonapi-client`'s clients
  expose their `definition`, which the keys need.
- **A list's state is its query.** Sorting maps to `sort` and column filters to `filter` one to one,
  any change other than paging drops `page[after]` and `page[before]`, paging follows the page's
  links, and a route's search is read back leniently through `parseQuery`, dropping what the
  definition refuses instead of failing the route.

## Consequences

An application keeps TanStack Form and its field components, its table markup, and its router, and
gets labels, options, limits, validation, the write, and the error placement from the declaration.
The model runs anywhere, so a binding for another framework's TanStack adapters reuses it. The
bindings follow TanStack Form, Query, and Table v9 releases through their public APIs only; TanStack
Form's `isSubmitSuccessful` is true after a write the server refused, since the submit handler
resolves, so a refused submit is read from the bound errors. Record and bulk actions, with bulk
writes through Atomic Operations, and Intl formatting of cells are left to later epics.
