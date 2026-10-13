/**
 * TanStack Query over the contacts application (resource SPEC 20.6): the
 * options `resourceQueries` of the built `@nizam-os/tanstack-query-jsonapi`
 * makes from the built `@nizam-os/jsonapi-client`'s clients, read and
 * written through query-core's observers, which every adapter's hooks are
 * made of, against the application served over a socket
 * (`support/contacts-server.ts`, with meetings, `runtime/meetings.ts`),
 * on PGlite and on the server `RESOURCE_PG_URL` names. A screen is an
 * observer with a listener, as a mounted `useQuery` is; the transport
 * records each request as it leaves. An infinite list pages both ways by
 * the server's links; each write settles once what the screens show has
 * refetched; removing a contact removes their record's entries and, as
 * the write names it, refetches the meetings whose contact the database
 * set to null.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 */
import type { QueryObserverOptions } from '@tanstack/query-core';

import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import {
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { isResponseError, pageCursors } from '@nizam-os/jsonapi-client';
import { resourceQueries } from '@nizam-os/tanstack-query-jsonapi';

import { runtimeDatabases } from '../runtime/database.ts';
import { openMeetingsRuntime } from '../runtime/meetings.ts';
import { ADA } from '../runtime/seed.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedClients } from '../support/recorded-clients.ts';

/** A screen showing what `options` reads, once it has. */
async function showing(
  queryClient: QueryClient,
  options: QueryObserverOptions<any, any, any, any, any>,
) {
  const observer = new QueryObserver(queryClient, options);
  observer.subscribe(() => {});
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });
  return observer;
}

/**
 * `records` with each cursor loosened to any string: a cursor carries the
 * second it was issued in (keyset SPEC 8), so two answers a second apart
 * hold different cursors for the same row.
 */
function anyCursor(records: ReadonlyArray<any>): Array<unknown> {
  return records.map((record) => ({
    ...record,
    $meta: {
      ...record.$meta,
      page: { ...record.$meta.page, cursor: expect.any(String) },
    },
  }));
}

/** The names on each page of an infinite list. */
function names(pages: ReadonlyArray<{ readonly data: ReadonlyArray<any> }>) {
  return pages.map(({ data }) => data.map(({ name }) => name));
}

describe.each(runtimeDatabases())(
  'on %s, TanStack Query over the contacts application',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    const departures: Array<Departure> = [];
    let queryClient: QueryClient;

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(
        database,
        await openMeetingsRuntime(database.db),
      );
    });
    beforeEach(async () => {
      await database.reset();
      departures.length = 0;
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    });
    afterEach(() => {
      queryClient.clear();
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    /** The application's clients, as editor, in English, each request recorded. */
    function clients() {
      return recordedClients(server.origin, departures, () => 'en');
    }

    /** Each request the transport sent, as its method and path. */
    function sent(): Array<string> {
      return departures.map(({ method, path }) => `${method} ${path}`);
    }

    /** Requests that refetch in parallel, in the order the transport sent them. */
    function refetched(...requests: ReadonlyArray<string>): Array<string> {
      const tail = sent().slice(-requests.length);
      expect(tail.toSorted()).toEqual(requests.toSorted());
      return tail;
    }

    /** Acme's contacts beyond the seed's Ada and Old Name, by name. */
    async function seedContacts(...people: ReadonlyArray<string>) {
      const { contacts } = clients();
      const ids = new Map<string, string>();
      for (const name of people) {
        const { data } = await contacts.create({ attributes: { name } });
        ids.set(name, data?.id ?? '');
      }
      departures.length = 0;
      return ids;
    }

    it("pages the editor's contacts both ways by the server's links, from the query's own cursors", async () => {
      // Acme's plan holds three contacts: the seed's two and Bea.
      await seedContacts('Bea');
      const contacts = resourceQueries(clients().contacts);
      const forward = new InfiniteQueryObserver(
        queryClient,
        contacts.pages({ sort: ['name'], page: { size: 1 } }),
      );
      await forward.refetch();
      let ahead = forward.getCurrentResult();
      expect(ahead.hasPreviousPage).toBe(false);
      while (ahead.hasNextPage) {
        ahead = await forward.fetchNextPage();
      }
      expect(names(ahead.data?.pages ?? [])).toEqual([
        ['Ada'],
        ['Bea'],
        ['Old Name'],
      ]);
      const second = ahead.data?.pages[1];
      const after = pageCursors(ahead.data?.pages[0] ?? {}).next;
      const backward = new InfiniteQueryObserver(
        queryClient,
        contacts.pages({ sort: ['name'], page: { size: 1, after } }),
      );
      await backward.refetch();
      let behind = backward.getCurrentResult();
      expect(names(behind.data?.pages ?? [])).toEqual([['Bea']]);
      expect(behind.data?.pages[0]?.data).toEqual(
        anyCursor(second?.data ?? []),
      );
      while (behind.hasPreviousPage) {
        behind = await backward.fetchPreviousPage();
      }
      expect(names(behind.data?.pages ?? [])).toEqual([['Ada'], ['Bea']]);
      expect(sent()).toEqual(
        Array.from({ length: 5 }, () => 'GET /api/contacts'),
      );
    });

    it('settles a create and an update once the list and the record the screens show have refetched', async () => {
      const contacts = resourceQueries(clients().contacts);
      const list = await showing(
        queryClient,
        contacts.list({ sort: ['name'] }),
      );
      const record = await showing(queryClient, contacts.get(ADA));
      const listed = () =>
        list
          .getCurrentResult()
          .data.data.map(({ name }: { name: string }) => name);
      let before = departures.length;
      await new MutationObserver(queryClient, contacts.create()).mutate({
        attributes: { name: 'Bea' },
      });
      expect(sent().slice(before)).toEqual([
        'POST /api/contacts',
        ...refetched('GET /api/contacts', `GET /api/contacts/${ADA}`),
      ]);
      expect(listed()).toEqual(['Ada', 'Bea', 'Old Name']);
      before = departures.length;
      await new MutationObserver(queryClient, contacts.update()).mutate({
        id: ADA,
        attributes: { name: 'Ada Lovelace' },
      });
      expect(sent().slice(before)).toEqual([
        `PATCH /api/contacts/${ADA}`,
        ...refetched('GET /api/contacts', `GET /api/contacts/${ADA}`),
      ]);
      expect(record.getCurrentResult().data.data.name).toBe('Ada Lovelace');
      expect(listed()).toEqual(['Ada Lovelace', 'Bea', 'Old Name']);
    });

    it("removes a contact's record entries, and refetches the lists and the meetings the database set to no contact before it settles", async () => {
      const bea = (await seedContacts('Bea')).get('Bea') ?? '';
      const app = clients();
      await app.meetings.create({
        attributes: {
          room: 'b-2',
          during: {
            start: '2026-02-02T09:00:00Z',
            end: '2026-02-02T10:00:00Z',
          },
          notes: 'Intro call',
        },
        relationships: { contact: bea },
      });
      const contacts = resourceQueries(app.contacts);
      const meetings = resourceQueries(app.meetings);
      const list = await showing(
        queryClient,
        contacts.list({ sort: ['name'] }),
      );
      const record = await showing(queryClient, contacts.get(bea));
      const booked = await showing(
        queryClient,
        meetings.list({ filter: { room: 'b-2' } }),
      );
      expect(booked.getCurrentResult().data.data[0].contact).toEqual({
        type: 'contacts',
        id: bea,
      });
      const before = departures.length;
      await new MutationObserver(
        queryClient,
        contacts.remove({ invalidates: [meetings.all] }),
      ).mutate(bea);
      expect(sent().slice(before)).toEqual([
        `DELETE /api/contacts/${bea}`,
        ...refetched('GET /api/contacts', 'GET /api/meetings'),
      ]);
      expect(booked.getCurrentResult().data.data[0].contact).toBeNull();
      expect(
        list
          .getCurrentResult()
          .data.data.map(({ name }: { name: string }) => name),
      ).toEqual(['Ada', 'Old Name']);
      expect(record.getCurrentResult().isError).toBe(false);
      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ['contacts', 'get', bea] }),
      ).toEqual([]);
    });

    it('leaves the cache as it was when the server refuses the write', async () => {
      const contacts = resourceQueries(clients().contacts);
      await showing(queryClient, contacts.list());
      const before = departures.length;
      await expect(
        new MutationObserver(queryClient, contacts.create()).mutate({
          attributes: { name: 'Twin', email: 'ada@example.com' },
        }),
      ).rejects.toSatisfy((error) =>
        isResponseError(error, 'CONTACT_EMAIL_TAKEN'),
      );
      expect(sent().slice(before)).toEqual(['POST /api/contacts']);
      expect(
        queryClient.getQueryState(contacts.list().queryKey)?.isInvalidated,
      ).toBe(false);
    });
  },
);
