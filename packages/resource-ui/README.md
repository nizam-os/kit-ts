# @nizam-os/resource-ui

Forms, lists, and record and bulk actions from
[`@nizam-os/resource-core`](https://github.com/nizam-os/kit/tree/main/packages/resource-core)
declarations, for any framework. A declared resource already knows each member's label, options,
limits, and filters, which writes it serves, and the server's words for every refusal; this package
models a form, a list screen, and the actions of a row and of a selection from them, so a screen
restates none of them. It imports no framework and nothing of TanStack: a screen in React, Vue,
Solid, Svelte, Angular, or Lit reads the same model, and TanStack Form and TanStack Table v9 take
its values as they are. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/SPEC.md),
sections 20 and 21, and the decisions behind it in
[ADR 0014](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0014-react-bindings-render-the-applications-one-messages-object.md),
[ADR 0015](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0015-react-bindings-a-model-under-tanstack-query-form-and-table.md),
[ADR 0016](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0016-a-form-sends-a-cleared-input-as-null.md),
[ADR 0018](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0018-forms-and-lists-are-a-model-and-a-tanstack-form-binding-in-two-packages.md),
and
[ADR 0019](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0019-record-and-bulk-actions-are-a-model-and-a-selection-writes-in-one-request.md).

Status: in development and unreleased. Field descriptors (`fieldsOf`), the form model
(`resourceForm`), the list model (`resourceList`), and record and bulk actions (`recordActions`,
`bulkActions`) have shipped.

## Install

```bash
pnpm add @nizam-os/resource-ui @nizam-os/resource-core @nizam-os/jsonapi-client
```

`@nizam-os/resource-core` and `@nizam-os/jsonapi-client` are peer dependencies: your application
declares the resources and defines its messages with its own copy of the one, and calls its API and
catches its errors with its own copy of the other, and the model reads those same values
([ADR 0006](https://github.com/nizam-os/kit/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
It needs no other peer and runs wherever JavaScript does, so server rendering on Node 22.12+, Bun,
Deno, and Cloudflare Workers reads the same model as the browser.

The screens bring their own form library and table, which take the model's values as they are: a
form's validator is a [Standard Schema](https://standardschema.dev), and a list reads and writes
[TanStack Table](https://tanstack.com/table/v9) v9's sorting and column filters as plain values.
[`@nizam-os/tanstack-form-resource`](https://github.com/nizam-os/kit/tree/main/packages/tanstack-form-resource#readme)
binds a form model to the TanStack Form of any framework, and
[`@nizam-os/tanstack-query-jsonapi`](https://github.com/nizam-os/kit/tree/main/packages/tanstack-query-jsonapi#readme)
gives the clients' calls to the TanStack Query of any framework. The examples below render with
React; a screen in another framework makes the same calls.

## Field descriptors

`fieldsOf(resource, messages)` describes each public field and relationship, the fields and then the
relationships, in declaration order, keyed by public name:

```ts
// src/contacts/fields.ts
import { fieldsOf } from '@nizam-os/resource-ui';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const contactFields = fieldsOf(Contacts, messages);
```

A descriptor holds `name`, `label`, `options`, `required`, `sortable`, `filter`, and `meta`, the
member's field metadata. `label` is the label function your messages hold for the member, and each
option's `label` the one they hold for the option: functions, never texts. Call them where you
render:

```tsx
import { contactFields } from './fields';

export function StatusInput() {
  const { status } = contactFields;
  return (
    <>
      <label htmlFor={status.name}>{status.label()}</label>
      <select id={status.name} name={status.name}>
        {status.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
    </>
  );
}
```

`filter` is `null` for a member that declares no `filter`; otherwise `filter.kind` names the control
a filter of the member takes and `filter.operators` the conditions it may write, the member's
declared `filter` in order:

| `filter.kind` | The member                                                        | A control such as                |
| ------------- | ----------------------------------------------------------------- | -------------------------------- |
| `reference`   | a relationship                                                    | a choice of the target's records |
| `options`     | has options, or is an array whose elements have them              | a choice, single or multiple     |
| `values`      | is an array without options                                       | a list of values                 |
| `boolean`     | is a boolean                                                      | yes, no, or either               |
| `number`      | is a number, including `int8` and `numeric`, which travel as text | a value or a range               |
| `date`        | is a date, a timestamp, or a timestamp with time zone             | a date or a range                |
| `text`        | is anything else                                                  | a text box                       |

The kind picks the control, and the operators say what it writes: a multiple choice among `options`
writes `{ in: [...] }` where `in` is declared, a `number` range `{ gte, lte }`, a `text` box
`{ startsWithi }`.

## Field rules

- Build descriptors once, at module scope, and call `label()` in render. A descriptor holds message
  functions, so with [Paraglide](https://paraglidejs.com) one built at startup renders in the locale
  of each request on the server and of each page in the browser. Never store what `label()`
  returned.
- Pass the one messages object your application defines with `defineMessages` (or
  `defaultMessages`): no provider and no hook carry it. A copy, such as an object spread of it, is
  refused, since resource-core knows checked messages by identity.
- Descriptors are frozen, through every option. Derive what a screen needs from them instead of
  changing them.
- `required` says what a create must carry. An update form's descriptors are never `required`; its
  members are only checked when the person changes them.
- `fieldsOf` throws `TypeError` before it returns for a resource no `declareResource` returned, for
  messages no definer returned, and for messages that label no member of the resource's type or not
  every member and option of it, such as messages defined for another declaration of the type.

## Forms

`resourceForm(resource, operation, options)` is a framework-free model of a create or an update
form: the members it holds, the values it starts from, a validator, the write the values make, and
where a refused write's errors land. A create form starts from the declaration's defaults, so build
it once:

```ts
// src/contacts/forms.ts
import { resourceForm } from '@nizam-os/resource-ui';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const createContact = resourceForm(Contacts, 'create', { messages });
```

An update form starts from the record it edits, as the client read it:

```ts
const { data: contact } = await clients.contacts.get(id);
const editContact = resourceForm(Contacts, 'update', { messages, record: contact });
```

`members` narrows a form to the public names it lists, such as `['status']` for a status switch; by
default it holds every member the operation writes, in declaration order.

| The model       | What it is                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`        | the descriptors of the members it holds (see above), each `required` as the operation requires it                                                               |
| `defaultValues` | what the form starts from: on create each member's default as a read gives it, else its blank, on update the record's values; frozen                            |
| `validator`     | a synchronous [Standard Schema](https://standardschema.dev) of the values: the declaration's own write validator, each issue on its field in the server's words |
| `write(values)` | what the client's `create` or `update` takes: the members the person changed, in their wire forms                                                               |
| `errors(error)` | a refused write's texts, `{ fields, form }`: one per field the server refused, and the rest for a banner                                                        |

A value is what its input edits: text for every string, number, date, and relationship id, `true`,
`false`, or `null` for a boolean until it is set, a list of texts for an array, and a JSON member's
value as it is. A cleared input is blank: `''`, `null` for a boolean, `undefined` for a JSON member.

A form library that takes a Standard Schema as its form validator, such as
[TanStack Form](https://tanstack.com/form/v1), puts each issue on the field its path names. A submit
handler writes and maps a refusal:

```ts
async function submit(values: typeof createContact.defaultValues) {
  try {
    await clients.contacts.create(createContact.write(values));
  } catch (error) {
    const { fields, form } = createContact.errors(error);
    // fields.email under the email input, form in a banner,
    // and the screen's own text when both are empty
  }
}
```

[`@nizam-os/tanstack-form-resource`](https://github.com/nizam-os/kit/tree/main/packages/tanstack-form-resource#forms)
hands a form model to the TanStack Form of any framework and binds a refused write's texts to its
fields.

## Form rules

- Validate before you write. `write(values)` throws `TypeError` for values the validator refuses,
  since a submit handler should only ever receive accepted ones; TanStack Form submits only those.
- Send what `write` returns, nothing more. It carries only the members the person changed, so a
  database default applies to every member left alone on create, and every stored value the person
  did not touch stays on update. Never spread the record into a write.
- Build an update model from the record the screen shows, and again whenever that record changes, as
  React's `useMemo(() => resourceForm(Contacts, 'update', { messages, record }), [record])` or Vue's
  `computed` does. `write` compares the values with the record its model was built from, so a model
  kept from an earlier read sends again what the person already saved once the record refetches
  after a save.
- A cleared input is sent as `null`, nullable or not: a member that is not nullable refuses it as
  required on its field, so a submit never reports success for a change the server did not make. To
  keep a stored value, leave the input as it is, or leave the member out of `members`.
- Show `errors(error)` as it comes: `fields` under their inputs and `form` in a banner, in the words
  the server localized for the request's `Accept-Language`. When both are empty, as for a network
  failure or a `500` without an error document, show your own text; an error's `message` is for
  logs.
- Texts render when the validator runs, so with Paraglide a locale change shows on the next
  validation, and the server's refusals arrive in the language the transport sent.
- A rule across members, such as a CHECK over two columns, runs on the client only when the write
  carries all of them. An update that changes one leaves the rest to their stored values, which only
  the server sees, so the server refuses it and its error lands by pointer: keep such members in one
  form.
- An integer or number input holds text: the write sends a number when the text is a finite JSON
  number, and the validator refuses `1e999` or `01` with the server's words. A `date-time` member
  needs its offset; convert a `datetime-local` input's value before it reaches the form.
- `resourceForm` throws `TypeError` before it returns for an operation the resource does not serve,
  options that do not fit the operation (a `record` on create, none on update, a member the
  operation does not write), and a record that lacks a member the form holds or holds another kind
  of value; each names the member, never the value.

## Lists

`resourceList(resource, messages)` is a framework-free model of a list screen. Its state is the
client's list query, the `sort`, `filter`, `page`, and `search` a list request sends; the model
reads it as [TanStack Table v9](https://tanstack.com/table/v9)'s sorting and column filters, writes
each change Table hands back as the next state, follows a result's links to the next and previous
pages, and reads a route's search back leniently, so a stale or edited link opens the list with what
the definition accepts. Build it once, at module scope, beside the descriptors:

```ts
// src/contacts/contacts-list.ts
import { fieldsOf, resourceList } from '@nizam-os/resource-ui';

import { messages } from '../localization/messages';
import { Contacts } from '../resources/contacts';

export const contactsList = resourceList(Contacts, messages);
export const contactFields = fieldsOf(Contacts, messages);
```

Keep the state in the route's search. With [TanStack Router](https://tanstack.com/router/v1),
`validateSearch` reads it, the query key follows it, and every change is a navigation, so Back, a
reload, and a shared link open the same page. `contacts` holds the client's TanStack Query options,
made by `resourceQueries(clients.contacts)` from
[`@nizam-os/tanstack-query-jsonapi`](https://github.com/nizam-os/kit/tree/main/packages/tanstack-query-jsonapi#queries):

```tsx
// src/routes/contacts.tsx
import type { RecordOf } from '@nizam-os/jsonapi-client';
import type { ListState } from '@nizam-os/resource-ui';

import type { definitions } from '../api/clients';
import type { Contacts } from '../resources/contacts';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  columnFilteringFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import { contacts } from '../api/queries';
import { contactFields, contactsList } from '../contacts/contacts-list';

type Contact = RecordOf<typeof definitions, typeof definitions.contacts>;

export const Route = createFileRoute('/contacts')({
  // A stale or edited link opens the list with what the definition accepts.
  validateSearch: (search: Record<string, unknown>) => contactsList.query(search),
  component: ContactsScreen,
});

// At module scope: Table rebuilds its rows when its features, columns, or data are new.
const features = tableFeatures({ rowSortingFeature, columnFilteringFeature });
const column = createColumnHelper<typeof features, Contact>();
const member = (name: 'name' | 'email' | 'status' | 'priority') =>
  column.accessor(name, {
    header: () => contactFields[name].label(),
    enableSorting: contactFields[name].sortable,
  });
const columns = column.columns([
  member('name'),
  member('email'),
  member('status'),
  member('priority'),
]);
const noContacts: ReadonlyArray<Contact> = [];
const sortOrders = { asc: 'ascending', desc: 'descending' } as const;

function ContactsScreen() {
  const state = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (next: ListState<typeof Contacts>) => void navigate({ search: next });
  // The previous page stays on screen while the next one loads.
  const result = useQuery({ ...contacts.list(state), placeholderData: keepPreviousData });
  const table = useTable({
    features,
    columns,
    data: result.data?.data ?? noContacts,
    getRowId: (contact) => contact.id,
    // The server sorts and filters; Table shows the model's state and hands each change back.
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting: contactsList.sorting(state),
      columnFilters: contactsList.columnFilters(state),
    },
    onSortingChange: (updater) => go(contactsList.withSorting(state, updater)),
    onColumnFiltersChange: (updater) => go(contactsList.withColumnFilters(state, updater)),
  });
  const status = table.getColumn('status');
  const statusFilter = status?.getFilterValue() as { readonly eq?: string } | undefined;
  const next = result.data && contactsList.next(state, result.data);
  const previous = result.data && contactsList.previous(state, result.data);
  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('search');
          go(contactsList.withSearch(state, typeof text === 'string' ? text : ''));
        }}
      >
        {/* The key resets the input when the route's search changes, as on Back. */}
        <input
          key={state.search}
          name="search"
          type="search"
          aria-label="Search"
          defaultValue={state.search}
        />
      </form>
      <select
        aria-label={contactFields.status.label()}
        value={statusFilter?.eq ?? ''}
        onChange={({ target }) =>
          status?.setFilterValue(target.value === '' ? undefined : { eq: target.value })
        }
      >
        <option value="">All</option>
        {contactFields.status.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label()}
          </option>
        ))}
      </select>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th key={header.id} aria-sort={sorted ? sortOrders[sorted] : undefined}>
                    <button
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={previous === undefined} onClick={() => previous && go(previous)}>
        Previous
      </button>
      <button disabled={next === undefined} onClick={() => next && go(next)}>
        Next
      </button>
    </>
  );
}
```

| Member                                                      | Gives                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `query(search)`                                             | the state a route's search holds, as JSON or as parameters, refusals dropped                       |
| `sorting(state)`, `withSorting(state, sorting)`             | Table's `sorting`, the declaration's default without `sort`, and back                              |
| `columnFilters(state)`, `withColumnFilters(state, filters)` | Table's `columnFilters`, each condition an object of operators, and back                           |
| `withSearch(state, text)`                                   | the state searching `text`; empty text removes `search`                                            |
| `withPageSize(state, size)`                                 | the state at `size` records a page                                                                 |
| `next(state, result)`, `previous(state, result)`            | the state at the page the result's links name; `undefined` at an end                               |
| `first(state)`                                              | the state at the first page                                                                        |
| `params(state)`                                             | the parameters a list request for `state` sends                                                    |
| `columns`, `page`, `searchable`                             | the descriptors of the members a read returns, the page sizes, and whether the definition searches |

## List rules

- Build the model once, at module scope. `columns` holds descriptors, so its labels, like
  `fieldsOf`'s, render in the locale of each render.
- Keep in the state only what the person changes. `query` reads `sort`, `filter`, `page`, and
  `search`, never `include` or `fields`; add what the screen always reads at the call:
  `contacts.list({ ...state, include: ['organization'] })`.
- `query` takes the JSON a router keeps and the API's own parameters, as a string or
  `URLSearchParams`, and drops each member the definition refuses, such as a filter of a member that
  no longer filters or a page size over `page.max`. JSON keeps its own forms, so a router that
  validates the search after every navigation reads back the state it wrote; parameters read one
  value as text and a repeated one as a list, as the API does.
- `query` names every member of the list query, `undefined` where the state holds none. TanStack
  Router hands a route the URL's search with the validated one spread over it, so a member left out
  would pass through as the URL holds it; with the router registered, `Route.useSearch()` is the
  `ListState` that `query` returns, and an `undefined` member never reaches the URL.
- Every change but paging starts at the first page: sorting, filtering, searching, and resizing drop
  `page.after` and `page.before` and keep `page.size`, since a cursor belongs to the order and the
  conditions it was issued under. Each function returns a new state and keeps every member it does
  not set.
- Give Table the model's `sorting` and `columnFilters` as its state on every render, with
  `manualSorting` and `manualFiltering`: the server sorts and filters, and Table shows the page it
  returned. The setters take Table's updaters as they are. Offer sorting where the descriptor is
  `sortable`; without `sort`, Table shows the declaration's default order as its sorting.
- A column filter's value is an object of its member's declared operators, `filter.operators`:
  `{ eq: 'active' }`, `{ in: ['active', 'paused'] }`, `{ gte: 2, lte: 4 }`. An operator set to
  `undefined` or to an empty list is left out, and a filter left without one is removed, so an
  emptied input clears its filter. `columnFilters` reads a bare value, `filter[status]=active`, as
  `{ eq: 'active' }`, and `withColumnFilters` keeps `filter.or`, which no column holds.
- Page by `next` and `previous`, each `undefined` at an end, and start over with `first`. A cursor
  counts no pages, so leave out Table's pagination feature, which pages by index.
- Keep the previous page on screen while the next one loads with
  `placeholderData: keepPreviousData`, and keep Table's features, columns, and the empty array of
  the first load at module scope. Key rows by `getRowId`, so a row keeps its state across pages and
  refetches.
- Search when the person submits, or debounce typing: each state is a request and a history entry.
- Without a router to keep the state, hold it in a reactive reference replaced whole by each change,
  and pass the options from a getter: in Vue, `const state = shallowRef(contactsList.query({}))`,
  `state.value = contactsList.withSearch(state.value, text)`, and
  `useQuery(() => contacts.list(state.value))`. Each function returns a new state, so only the
  replacement needs tracking
  ([`shallowRef`](https://vuejs.org/api/reactivity-advanced.html#shallowref)).
- `query` checks names and shapes, while the server alone checks values, such as a date or an
  expired cursor: it refuses one with a `400` whose error names its parameter in `source.parameter`.
  Recover by the state: `first(state)` for `page[after]` or `page[before]`, and `withColumnFilters`
  without the filter it names otherwise.
- `resourceList` throws `TypeError` for a resource no `declareResource` returned and for messages as
  `fieldsOf` does. Its functions throw for a state that is no list state; a sort of a member that
  does not sort, or of one member twice; a filter of a member that does not filter, with an operator
  its member does not declare, or whose value is no object of operators; a page size that is no
  positive safe integer up to `page.max`; a result no `list` returned; and `withSearch` on a
  definition without a search parameter, which TypeScript refuses too. A message names the function
  and the type, never a value.

## Record and bulk actions

`recordActions(resource, options)` and `bulkActions(resource, options)` describe the actions of a
row's menu and of a selection's bar: what each writes, whether the person may run it now, the texts
it shows, and where a refusal lands. An action removes the record or updates it with fixed values,
and the declaration must serve that write, so build both models at module scope: an action the
declaration refuses throws `TypeError` at startup, not on a click.

```ts
// src/contacts/actions.ts
import { bulkActions, recordActions } from '@nizam-os/resource-ui';

import { m } from '../paraglide/messages';
import { Contacts } from '../resources/contacts';
import { permissions } from '../session';

export const contactActions = recordActions(Contacts, {
  can: (name) => permissions.has(`contacts.${name}`),
  actions: {
    archive: {
      label: m.contact_archive,
      update: { attributes: { status: 'archived' } },
      hidden: (contact) => contact.status === 'archived',
      done: (contact) => m.contact_archived({ name: contact.name }),
    },
    remove: {
      label: m.contact_remove,
      tone: 'danger',
      remove: true,
      confirm: { title: (contact) => m.contact_remove_title({ name: contact.name }) },
    },
  },
});

export const selectionActions = bulkActions(Contacts, {
  tooMany: m.selection_too_many, // ({ max }) => string
  actions: {
    restore: {
      label: m.contacts_restore,
      update: { attributes: { status: 'active' } },
      done: m.contacts_restored, // ({ count }) => string
    },
    remove: {
      label: m.contacts_remove,
      tone: 'danger',
      remove: true,
      confirm: { title: m.contacts_remove_title }, // ({ count }) => string
    },
  },
});
```

A record action's texts take the record, as the list read it; a bulk action's take `{ count }`, so a
Paraglide message with a `count` variable, plural variants included, fills the slot as it stands.
Each model is a frozen record of its actions by name, in the order given:

| An action                             | What it is                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `name`, `call`                        | its name, and the call it makes: `'update'` or `'remove'`, which types the action                                             |
| `tone`                                | `'neutral'`, or `'danger'` for a write a person cannot take back                                                              |
| `label`, `confirm`, `done`            | your functions as given; `confirm` is `null` without one, as are its absent `body` and `confirm` and an absent `done`         |
| `state(target)`                       | `{ visible, disabled, reason }` for a record, or for a selection's ids                                                        |
| `variables(record)`                   | a record action's: what `resourceQueries`' `update` or `remove` takes, `{ id, ...values }` or the id                          |
| `operations(ids)`, `max`              | a bulk action's: one operation per id, what `operationsMutation` takes, and the most ids one request takes                    |
| `errors(error)`, `errors(error, ids)` | a refusal's texts: `{ fields, form }` for a record, as a form's; `{ records, form }` for a selection, each record's by its id |

A row makes the client's own calls through
[`@nizam-os/tanstack-query-jsonapi`](https://github.com/nizam-os/kit/tree/main/packages/tanstack-query-jsonapi)'s
`resourceQueries`, and the bar sends the selection in one Atomic Operations request through its
`operationsMutation`, which the server commits whole or not at all:

```tsx
const update = useMutation(contacts.update());
const remove = useMutation(contacts.remove());
const operations = useMutation(operationsMutation(transport));

async function run(action: RecordAction<typeof Contacts>, contact: ActionRecord<typeof Contacts>) {
  try {
    await (action.call === 'remove'
      ? remove.mutateAsync(action.variables(contact))
      : update.mutateAsync(action.variables(contact)));
    notify(action.done?.(contact));
  } catch (error) {
    const { fields, form } = action.errors(error);
    // fields on the row's cells, form in a banner
  }
}

async function runOnSelection(action: BulkAction<typeof Contacts>, ids: ReadonlyArray<string>) {
  try {
    await operations.mutateAsync(action.operations(ids));
    notify(action.done?.({ count: ids.length }));
  } catch (error) {
    const { records, form } = action.errors(error, ids);
    // mark each row records names, form in a banner
  }
}

function RowMenu({ contact }: { readonly contact: ActionRecord<typeof Contacts> }) {
  return Object.values(contactActions).map((action) => {
    const { visible, disabled, reason } = action.state(contact);
    return visible ? (
      <button
        key={action.name}
        disabled={disabled}
        title={reason ?? undefined}
        onClick={() => run(action, contact)}
      >
        {action.label()}
      </button>
    ) : null;
  });
}
```

## Action rules

- Build both models once, at module scope. They hold your functions and call them only when the
  screen asks, so every text, a disabled action's reason included, renders in the locale of that
  render.
- Hand `can` what the application knows of the person; only `true` shows an action. A hidden action
  is disabled too, so a menu that shows it anyway cannot run it. Without `can`, every action shows,
  and the server still authorizes every write.
- Read `state(target)` on every render: `visible` decides whether the action shows, `disabled`
  whether it runs, and `reason`, when it is a text, goes in a tooltip.
- Confirm every write a person cannot take back with `confirm`, and mark it `tone: 'danger'`. The
  button takes the action's `label` when the confirmation gives no `confirm`.
- Keep a selection as ids. TanStack Table's row selection, with rows keyed by
  `getRowId: (row) => row.id`, holds them across pages and refetches, and every member of a bulk
  action reads ids, never records.
- Size the page to the cap. `max` is the definition's `atomic.max`, ten by default; a selection over
  it is disabled with your `tooMany({ max })`, and `operations` throws for it. Where a bar should
  take a whole page, raise `atomic.max` on the definition to the page's largest size: the server
  reads the same value.
- Send a selection in one request through `operationsMutation`. The server commits all of it or
  none, so after a refusal every selected record is as it was: mark the rows `records` names, show
  `form` in a banner, and keep the selection for a retry.
- An update action's values are fixed, and checked once against the declaration and the update's
  validator: a member the update does not write, or values the server would refuse, fail when the
  model is built. A CHECK across members runs on the client only when the values carry all of them;
  the server judges the rest at the write, and its refusal lands on the members it names.
- A refusal lands on any member of the resource, not only on what the action writes: a row shows
  every member a read returns, so a unique constraint across a name and its organization marks both
  cells.
- Call one action on its own where a screen has a button for it: each action is typed by its call,
  so `update.mutateAsync(contactActions.archive.variables(contact))` compiles as it stands. Narrow
  on `call` only in code that runs any action, as a menu does. Write the actions in the call, or
  keep them in a constant written with `satisfies`: options annotated `RecordActionsOptions` type
  every action as either call.
- Show `done` once the mutation settles. A `resourceQueries` write settles after the reads it
  invalidates have refetched, and `operationsMutation` after the reads of every type it wrote.
- `recordActions` and `bulkActions` throw `TypeError` before they return for a write the declaration
  does not serve and for each argument they cannot read; `variables` throws for a record without a
  string id, and `operations` for a list that `state` disables. Each message names the function, the
  action, and the member, never a value.
