/**
 * The contacts application's list screen as the README writes it
 * (resource SPEC 20.7): the state in a TanStack Router route's search,
 * read back by `query`, the page TanStack Query reads for it, and TanStack
 * Table v9 showing the model's sorting and column filters with its stages
 * manual, every change a navigation. The router is registered, as an
 * application registers it, so `useSearch` is typed by `validateSearch`.
 * Code-based routes stand in for the README's file route, which needs the
 * router's generator; memory history stands in for the browser's.
 * @ref https://tanstack.com/router/v1/docs/framework/react/routing/code-based-routing
 * @ref https://tanstack.com/router/v1/docs/framework/react/decisions-on-dx#declaring-the-router-instance-for-type-inference
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/column-filtering
 */
import type { ReactElement } from 'react';

import type { ListState } from '@nizam-os/resource-ui';

import type { Contact, ContactQueries } from '../../support/contact-queries.ts';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  columnFilteringFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import { fieldsOf, resourceList } from '@nizam-os/resource-ui';

import { contactMessages } from '../../localization/contact-messages.ts';
import { Contacts } from '../../resources/contacts.ts';

/** Built once, at startup, beside the descriptors. */
const contactsList = resourceList(Contacts, contactMessages);
const contactFields = fieldsOf(Contacts, contactMessages);

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

const rootRoute = createRootRouteWithContext<{
  readonly api: ContactQueries;
}>()({ component: Outlet });

const contactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contacts',
  // A stale or edited link opens the list with what the definition accepts.
  validateSearch: (search: Record<string, unknown>) =>
    contactsList.query(search),
  component: ContactsScreen,
});

const routeTree = rootRoute.addChildren([contactsRoute]);

function listRouter(api: ContactQueries, entry: string) {
  return createRouter({
    routeTree,
    context: { api },
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof listRouter>;
  }
}

/** The status an `eq` filter holds, `''` for none. */
function statusOf(filter: unknown): string {
  return typeof filter === 'object' &&
    filter !== null &&
    'eq' in filter &&
    typeof filter.eq === 'string'
    ? filter.eq
    : '';
}

function ContactsScreen(): ReactElement {
  const state = contactsRoute.useSearch();
  const navigate = contactsRoute.useNavigate();
  const { api } = contactsRoute.useRouteContext();
  const go = (next: ListState<typeof Contacts>) =>
    void navigate({ search: next });
  // The previous page stays on screen while the next one loads.
  const result = useQuery({
    ...api.contacts.list(state),
    placeholderData: keepPreviousData,
  });
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
    onSortingChange: (updater) => {
      go(contactsList.withSorting(state, updater));
    },
    onColumnFiltersChange: (updater) => {
      go(contactsList.withColumnFilters(state, updater));
    },
  });
  const status = table.getColumn('status');
  const page = result.data;
  const next = page === undefined ? undefined : contactsList.next(state, page);
  const previous =
    page === undefined ? undefined : contactsList.previous(state, page);
  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('search');
          go(
            contactsList.withSearch(
              state,
              typeof text === 'string' ? text : '',
            ),
          );
        }}
      >
        {/* The key resets the input when the route's search changes, as on Back. */}
        <input
          key={state.search}
          name="search"
          type="search"
          aria-label="Suche"
          defaultValue={state.search}
        />
      </form>
      <select
        aria-label={contactFields.status.label()}
        value={statusOf(status?.getFilterValue())}
        onChange={({ target }) => {
          status?.setFilterValue(
            target.value === '' ? undefined : { eq: target.value },
          );
        }}
      >
        <option value="">Alle</option>
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
                  <th
                    key={header.id}
                    aria-sort={
                      sorted === false ? undefined : sortOrders[sorted]
                    }
                  >
                    <button
                      type="button"
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
      <button
        type="button"
        disabled={previous === undefined}
        onClick={() => {
          if (previous !== undefined) {
            go(previous);
          }
        }}
      >
        Zurück
      </button>
      <button
        type="button"
        disabled={next === undefined}
        onClick={() => {
          if (next !== undefined) {
            go(next);
          }
        }}
      >
        Weiter
      </button>
    </>
  );
}

/** The list screen and where its router stands. */
export interface ContactsScreenOf {
  readonly element: ReactElement;
  /** The router's current search, as its URL holds it. */
  readonly search: () => string;
}

/** The list screen under a router over memory history that starts at `entry`. */
export function contactsScreen(
  api: ContactQueries,
  entry: string,
): ContactsScreenOf {
  const router = listRouter(api, entry);
  return {
    element: <RouterProvider router={router} />,
    search: () => router.state.location.searchStr,
  };
}
