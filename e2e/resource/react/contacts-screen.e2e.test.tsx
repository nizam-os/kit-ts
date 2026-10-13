/**
 * The contacts application's list on screen (resource SPEC 20.8): the
 * README's list screen (`screens/contacts-screen.tsx`), rendered by React
 * in jsdom with the built `@nizam-os/resource-ui`, TanStack Router,
 * Query, and Table v9, for a person whose browser prefers German, against
 * the application served over a socket (`support/contacts-server.ts`) on
 * PGlite and on the server `RESOURCE_PG_URL` names. Nothing between a
 * click and the database is mocked: each list request carries the
 * state's own parameters, the server sorts, filters, searches, and pages
 * by them, a stale link opens with what the definition accepts, and a
 * create on the same screen refetches the list.
 * @ref https://tanstack.com/router/v1/docs/framework/react/guide/search-params
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { QueryClient } from '@tanstack/react-query';
import { defaultStringifySearch } from '@tanstack/react-router';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { getLocale } from '../localization/paraglide/runtime.js';
import { runtimeDatabases } from '../runtime/database.ts';
import { contactQueries } from '../support/contact-queries.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedClients } from '../support/recorded-clients.ts';
import { preferLanguages } from '../support/screen-person.ts';
import { contactsScreen } from './screens/contacts-screen.tsx';
import { CreateContact } from './screens/create-contact.tsx';
import { renderScreen } from './screens/render-screen.tsx';

/** A link to the list, its search as the router writes one. */
function linked(search: Record<string, unknown>): string {
  return `/contacts${defaultStringifySearch(search)}`;
}

/** The names the table shows, in order. */
function names(): Array<string | null> {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? null);
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

/** The parameters of the router's URL, by name. */
function paramsOf(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

/** How the header of `name` announces its order. */
function sortOf(name: string): string | null {
  return screen.getByRole('columnheader', { name }).getAttribute('aria-sort');
}

describe.each(runtimeDatabases())(
  "on %s, the contacts application's list, in German",
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    let queryClient: QueryClient;
    const departures: Array<Departure> = [];

    beforeAll(async () => {
      preferLanguages(['de-DE', 'de']);
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
      departures.length = 0;
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    });
    afterEach(() => {
      cleanup();
      queryClient.clear();
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    function clients() {
      return recordedClients(server.origin, departures, getLocale);
    }

    /** The list screen at `entry`, under the editor's clients. */
    function listScreen(entry: string) {
      const api = contactQueries(clients());
      const list = contactsScreen(api, entry);
      return { ...renderScreen(queryClient, list.element), list, api };
    }

    /** The decoded query of the last list request. */
    function listed(): string | undefined {
      const request = departures.findLast(
        ({ method, path }) => method === 'GET' && path === '/api/contacts',
      );
      return request === undefined
        ? undefined
        : decodeURIComponent(request.query);
    }

    /** Waits for the table to show `expected`, and returns the query that listed them. */
    async function shows(expected: ReadonlyArray<string>) {
      await waitFor(() => {
        expect(names()).toEqual(expected);
      });
      return listed();
    }

    it("sorts from its header, filters by status, and searches, each request the state's parameters", async () => {
      const { user, list } = listScreen('/contacts');
      expect(await shows(['Ada', 'Old Name'])).toBe('');
      expect(
        screen
          .getAllByRole('columnheader')
          .map(({ textContent }) => textContent),
      ).toEqual(['Name', 'E-Mail', 'Status', 'Priorität']);
      expect(sortOf('Name')).toBe('ascending');
      expect([button('E-Mail').disabled, button('Priorität').disabled]).toEqual(
        [true, false],
      );
      await user.click(button('Name'));
      // A plain click sorts by that column alone, as Table's toggle does.
      expect(await shows(['Old Name', 'Ada'])).toBe('sort=-name');
      expect(sortOf('Name')).toBe('descending');
      const status = screen.getByRole('combobox', { name: 'Status' });
      expect(
        within(status)
          .getAllByRole('option')
          .map(({ textContent }) => textContent),
      ).toEqual(['Alle', 'Aktiv', 'Archiviert']);
      await user.selectOptions(status, 'Archiviert');
      expect(await shows(['Old Name'])).toBe(
        'sort=-name&filter[status][eq]=archived',
      );
      expect(paramsOf(list.search())).toEqual({
        sort: '["-name"]',
        filter: '{"status":{"eq":"archived"}}',
      });
      await user.selectOptions(status, 'Alle');
      expect(await shows(['Old Name', 'Ada'])).toBe('sort=-name');
      await user.type(
        screen.getByRole('searchbox', { name: 'Suche' }),
        'ada{Enter}',
      );
      expect(await shows(['Ada'])).toBe('sort=-name&filter[q]=ada');
    });

    it('pages by cursor over real pages, ends where the server has no next page, and drops the cursor on a sort change', async () => {
      await clients().contacts.create({ attributes: { name: 'Bea' } });
      const { user } = listScreen(linked({ page: { size: 1 } }));
      expect(await shows(['Ada'])).toBe('page[size]=1');
      expect(button('Zurück').disabled).toBe(true);
      await user.click(button('Weiter'));
      expect(await shows(['Bea'])).toMatch(
        /^page\[size\]=1&page\[after\]=.+$/u,
      );
      await user.click(button('Weiter'));
      expect(await shows(['Old Name'])).toMatch(
        /^page\[size\]=1&page\[after\]=/u,
      );
      expect(button('Weiter').disabled).toBe(true);
      await user.click(button('Zurück'));
      expect(await shows(['Bea'])).toMatch(
        /^page\[size\]=1&page\[before\]=.+$/u,
      );
      await user.click(button('Name'));
      expect(await shows(['Old Name'])).toBe('sort=-name&page[size]=1');
    });

    it('opens a stale link with what the definition accepts, keeping nothing the URL held that the state does not', async () => {
      const { user, list } = listScreen(
        linked({
          sort: ['nickname'],
          filter: { website: { eq: 'x' }, status: { eq: 'active' } },
          page: { size: 500 },
          include: ['organization'],
          fields: { contacts: ['name'] },
        }),
      );
      expect(await shows(['Ada'])).toBe('filter[status][eq]=active');
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', { name: 'Status' })
          .value,
      ).toBe('active');
      await user.click(button('Name'));
      expect(await shows(['Ada'])).toBe('sort=-name&filter[status][eq]=active');
      // The router's URL keeps none of the members the state does not hold.
      expect(paramsOf(list.search())).toEqual({
        sort: '["-name"]',
        filter: '{"status":{"eq":"active"}}',
      });
    });

    it('refetches the list after a create on the same screen', async () => {
      const api = contactQueries(clients());
      const list = contactsScreen(api, '/contacts');
      const { user } = renderScreen(
        queryClient,
        <>
          <CreateContact api={api} />
          {list.element}
        </>,
      );
      await shows(['Ada', 'Old Name']);
      await user.type(screen.getByLabelText('Name'), 'Bea');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await shows(['Ada', 'Bea', 'Old Name'])).toBe('');
    });
  },
);
