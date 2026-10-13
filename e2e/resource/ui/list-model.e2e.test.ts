/**
 * The list model over the contacts application (resource SPEC 20.7): the
 * built `@nizam-os/resource-ui`'s `resourceList` with the application's
 * Paraglide messages, its states sent by the built
 * `@nizam-os/jsonapi-client`'s clients to the application served over a
 * socket (`support/contacts-server.ts`), on PGlite and on the server
 * `RESOURCE_PG_URL` names. A state changes as TanStack Table v9 and a
 * router change it: a header toggles through Table's updater, a column
 * filter is set through one, and a link is read back as a route reads its
 * search. Each request carries the state's own parameters; the server
 * sorts, filters, searches, and pages by them; and a stale link opens the
 * list, a cursor or a filter value the server refuses answered by a 400
 * naming its parameter, from which the screen recovers.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/sorting
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 */
import type { ListState } from '@nizam-os/resource-ui';

import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resourceList } from '@nizam-os/resource-ui';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { runtimeDatabases } from '../runtime/database.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { inLocale } from '../support/in-locale.ts';
import { recordedClients, refusal } from '../support/recorded-clients.ts';

/** Built once, as an application builds it at startup. */
const contactsList = resourceList(Contacts, contactMessages);

type State = ListState<typeof Contacts>;

/** A column filter as Table v9 holds one. */
interface Entry {
  readonly id: string;
  readonly value: unknown;
}

/** A header toggle as Table v9 hands it to `onSortingChange`: the column's direction flipped. */
function toggled(id: string) {
  return (
    current: ReadonlyArray<{ readonly id: string; readonly desc: boolean }>,
  ) =>
    current.map((entry) =>
      entry.id === id ? { ...entry, desc: !entry.desc } : entry,
    );
}

/** `column.setFilterValue(value)` as Table v9 hands it to `onColumnFiltersChange`. */
function filtered(id: string, value: unknown) {
  return (current: ReadonlyArray<Entry>) => [
    ...current.filter((filter) => filter.id !== id),
    ...(value === undefined ? [] : [{ id, value }]),
  ];
}

describe.each(runtimeDatabases())(
  'on %s, the list model over the contacts application',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    const departures: Array<Departure> = [];

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
      departures.length = 0;
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    /** The editor's contacts client, in German, each request recorded. */
    function contacts() {
      return recordedClients(server.origin, departures, () => 'de').contacts;
    }

    /** The names the list request for `state` shows, after checking it sent the state's own parameters. */
    async function shown(state: State) {
      const { data } = await contacts().list(state);
      expect(departures.at(-1)?.query).toBe(
        contactsList.params(state).toString(),
      );
      return data.map(({ name }) => name);
    }

    it('labels its columns in the language of each render, from a model built once', async () => {
      expect(contactsList.columns.map(({ name }) => name)).toEqual([
        'kind',
        'name',
        'nickname',
        'email',
        'website',
        'status',
        'priority',
        'discount',
        'tags',
        'createdAt',
        'organization',
      ]);
      const labels = () => contactsList.columns.map(({ label }) => label());
      expect(await inLocale('de', labels)).toEqual([
        'Art',
        'Name',
        'Spitzname',
        'E-Mail',
        'Website',
        'Status',
        'Priorität',
        'Rabatt',
        'Schlagwörter',
        'Erstellt am',
        'Organisation',
      ]);
      expect((await inLocale('en', labels)).slice(2, 4)).toEqual([
        'Nickname',
        'Email',
      ]);
      expect(contactsList.page).toEqual({ default: 20, max: 50 });
    });

    it('sorts, filters, and searches by the state, the default sort the order the server applies', async () => {
      await contacts().create({ attributes: { name: 'Bea' } });
      const start = contactsList.query({});
      expect(contactsList.sorting(start)).toEqual([
        { id: 'name', desc: false },
        { id: 'createdAt', desc: true },
      ]);
      expect(await shown(start)).toEqual(['Ada', 'Bea', 'Old Name']);
      const descending = contactsList.withSorting(start, toggled('name'));
      expect(descending).toEqual({ sort: ['-name', '-createdAt'] });
      expect(await shown(descending)).toEqual(['Old Name', 'Bea', 'Ada']);
      const active = contactsList.withColumnFilters(
        descending,
        filtered('status', { in: ['active'] }),
      );
      expect(contactsList.columnFilters(active)).toEqual([
        { id: 'status', value: { in: ['active'] } },
      ]);
      expect(await shown(active)).toEqual(['Bea', 'Ada']);
      const searched = contactsList.withSearch(active, 'ada');
      expect(await shown(searched)).toEqual(['Ada']);
      // A multiple choice emptied by the person holds an empty list, which removes its filter.
      const cleared = contactsList.withColumnFilters(
        contactsList.withSearch(searched, ''),
        filtered('status', { in: [] }),
      );
      expect(cleared).toEqual({ sort: ['-name', '-createdAt'] });
      expect(await shown(cleared)).toEqual(['Old Name', 'Bea', 'Ada']);
    });

    it('pages by cursor over real pages, ends where the server has no next page, and drops the cursor on a sort change', async () => {
      await contacts().create({ attributes: { name: 'Bea' } });
      const client = contacts();
      let state = contactsList.withPageSize(
        contactsList.query({ sort: ['name'] }),
        1,
      );
      const names: Array<string> = [];
      let next: State | undefined = state;
      while (next !== undefined) {
        state = next;
        const page = await client.list(state);
        names.push(...page.data.map(({ name }) => name));
        next = contactsList.next(state, page);
      }
      expect(names).toEqual(['Ada', 'Bea', 'Old Name']);
      expect(state.page?.after).toEqual(expect.any(String));
      const last = await client.list(state);
      const back = contactsList.previous(state, last);
      expect(back?.page).toEqual({ size: 1, before: expect.any(String) });
      expect(await shown(back ?? {})).toEqual(['Bea']);
      const resorted = contactsList.withSorting(back ?? {}, toggled('name'));
      expect(resorted).toEqual({ sort: ['-name'], page: { size: 1 } });
      expect(await shown(resorted)).toEqual(['Old Name']);
      expect(contactsList.first(state)).toEqual({
        sort: ['name'],
        page: { size: 1 },
      });
    });

    it('opens a stale or edited link with what the definition accepts, as JSON or as parameters', async () => {
      await contacts().create({ attributes: { name: 'Adele', priority: 4 } });
      const edited = contactsList.query(
        'sort=nickname&filter[website][eq]=x&filter[status][in]=active&page[size]=500&include=organization&fields[contacts]=name&filter[q]=ada',
      );
      expect(edited).toEqual({
        filter: { status: { in: 'active' } },
        search: 'ada',
      });
      expect(await shown(edited)).toEqual(['Ada']);
      const stored = contactsList.query({
        sort: ['-name', 7],
        filter: {
          name: { startsWithi: 'Ad', eq: null },
          priority: { gte: 2 },
        },
        page: { size: 2.5 },
      });
      expect(stored).toEqual({
        filter: { name: { startsWithi: 'Ad' }, priority: { gte: 2 } },
      });
      expect(await shown(stored)).toEqual(['Adele']);
      const routed = JSON.parse(
        JSON.stringify(contactsList.withSorting(edited, toggled('name'))),
      );
      expect(contactsList.query(routed)).toEqual({
        sort: ['-name', '-createdAt'],
        filter: { status: { in: 'active' } },
        search: 'ada',
      });
    });

    it('recovers from the 400 of a cursor or a filter value the server refuses, which names the parameter', async () => {
      const stale = contactsList.query({
        sort: ['name'],
        page: { size: 1, after: 'expired' },
      });
      const cursor = await refusal(async () => contacts().list(stale));
      expect([
        cursor.status,
        cursor.errors.map(({ source }) => source?.parameter),
      ]).toEqual([400, ['page[after]']]);
      expect(await shown(contactsList.first(stale))).toEqual(['Ada']);
      const dated = contactsList.query(
        'filter[createdAt][gte]=yesterday&filter[status]=active',
      );
      const value = await refusal(async () => contacts().list(dated));
      expect([
        value.status,
        value.errors.map(({ source }) => source?.parameter),
      ]).toEqual([400, ['filter[createdAt][gte]']]);
      // The screen removes the filter the error names, as the person would.
      const recovered = contactsList.withColumnFilters(dated, (filters) =>
        filters.filter(({ id }) => id !== 'createdAt'),
      );
      expect(await shown(recovered)).toEqual(['Ada']);
    });
  },
);
