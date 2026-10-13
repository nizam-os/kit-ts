/**
 * The contacts application's screen built with Vue (resource SPEC 20.8): the
 * list and the create form of `screens/`, written with Vue Query's and Vue
 * Form's composables in render functions, mounted by Vue in jsdom with the
 * built `@nizam-os/resource-ui`, `@nizam-os/tanstack-form-resource`, and
 * `@nizam-os/tanstack-query-jsonapi`, for a person whose browser prefers
 * German, against the application served over a socket
 * (`support/contacts-server.ts`) on PGlite and on the server
 * `RESOURCE_PG_URL` names. Nothing between a keystroke and the database is
 * mocked; the transport records each request as it leaves. A search the
 * person submits reads its own page; the form refuses what the server would
 * before anything is sent; the server's refusal of a taken email lands on
 * its field, the list left as it was, and the create that answers it
 * refetches the list; the plan's quota, which no field holds, lands in the
 * banner; a removal refetches the list, which makes room for the same
 * create; and a selection's removal, a bulk action of
 * `@nizam-os/resource-ui`, is one Atomic Operations request through Vue Query
 * that refetches the list too (SPEC 21.5).
 * @ref https://testing-library.com/docs/user-event/intro
 * @ref https://tanstack.com/query/v5/docs/framework/vue/guides/invalidations-from-mutations
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { QueryClient } from '@tanstack/vue-query';
import { screen, waitFor, within } from '@testing-library/dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { h } from 'vue';

import { getLocale } from '../localization/paraglide/runtime.js';
import { runtimeDatabases } from '../runtime/database.ts';
import { ARCHIVED } from '../runtime/seed.ts';
import { announces, barButton, checkbox } from '../support/action-screen.ts';
import { contactActionQueries } from '../support/contact-queries.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedTransport, sentFrom } from '../support/recorded-clients.ts';
import { errorOf, preferLanguages } from '../support/screen-person.ts';
import { ContactList } from './screens/contact-list.ts';
import { CreateContact } from './screens/create-contact.ts';
import { cleanup, mountScreen } from './screens/mount-screen.ts';

const BEA = '00000000-0000-4000-8000-0000000000b1';

/** The names the list shows, in order. */
function names(): Array<string | null> {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent ?? null);
}

/** Waits for the list to show `expected`. */
async function shows(expected: ReadonlyArray<string>): Promise<void> {
  await waitFor(() => {
    expect(names()).toEqual(expected);
  });
}

describe.each(runtimeDatabases())(
  "on %s, the contacts application's Vue screen, in German",
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

    /** The form above the list, over the editor's clients, and what the person does on it. */
    function contactsScreen() {
      const api = contactActionQueries(
        recordedTransport(server.origin, departures, getLocale),
      );
      const user = mountScreen(queryClient, () => [
        h(CreateContact, { api }),
        h(ContactList, { api }),
      ]);
      return {
        user,
        save: async () => {
          await user.click(screen.getByRole('button', { name: 'Speichern' }));
        },
        retype: async (label: string, text: string) => {
          await user.clear(screen.getByLabelText(label));
          await user.type(screen.getByLabelText(label), text);
        },
        remove: async (name: string) => {
          await user.click(
            screen.getByRole('button', { name: `${name} entfernen` }),
          );
        },
      };
    }

    it("lists the editor's contacts by the list model's state, and reads the page for a search the person submits", async () => {
      const { user } = contactsScreen();
      await shows(['Ada', 'Old Name']);
      expect(
        screen
          .getAllByRole('columnheader')
          .map(({ textContent }) => textContent),
      ).toEqual(['', 'Name', 'E-Mail', '']);
      await user.type(
        screen.getByRole('searchbox', { name: 'Suche' }),
        'ada{Enter}',
      );
      await shows(['Ada']);
      expect(sentFrom(departures, 0)).toEqual([
        'GET /api/contacts',
        'GET /api/contacts filter[q]=ada',
      ]);
    });

    it("refuses a missing name before anything is sent, puts the server's refusal of a taken email on its field, the list left as it was, and refetches the list once the create that answers it lands", async () => {
      const { save, retype } = contactsScreen();
      await shows(['Ada', 'Old Name']);
      const listed = departures.length;
      await save();
      await waitFor(() => {
        expect(errorOf('Name')).toBe('Name ist erforderlich.');
      });
      expect(sentFrom(departures, listed)).toEqual([]);
      await retype('Name', 'Ada Twin');
      // The column is citext: Ada's email, in other letters.
      await retype('E-Mail', 'ADA@example.com');
      await save();
      await waitFor(() => {
        expect(errorOf('E-Mail')).toBe(
          'E-Mail gehört bereits einem anderen Kontakt.',
        );
      });
      expect(errorOf('Name')).toBeUndefined();
      expect(sentFrom(departures, listed)).toEqual(['POST /api/contacts']);
      await retype('E-Mail', 'ada.twin@example.com');
      expect(errorOf('E-Mail')).toBeUndefined();
      await save();
      await shows(['Ada', 'Ada Twin', 'Old Name']);
      // The create settles once the list has refetched; the form resets then.
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
      });
      expect(sentFrom(departures, listed)).toEqual([
        'POST /api/contacts',
        'POST /api/contacts',
        'GET /api/contacts',
      ]);
    });

    it('puts the quota of a full plan in the banner, and a removal that refetches the list makes room for the same create', async () => {
      const { save, retype, remove } = contactsScreen();
      await shows(['Ada', 'Old Name']);
      await retype('Name', 'Bea');
      await save();
      await shows(['Ada', 'Bea', 'Old Name']);
      // Acme's plan holds three contacts.
      await retype('Name', 'Cleo');
      await save();
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Das Kontingent für diesen Vorgang ist aufgebraucht.',
      );
      const refused = departures.length;
      await remove('Old Name');
      await shows(['Ada', 'Bea']);
      expect(sentFrom(departures, refused)).toEqual([
        `DELETE /api/contacts/${ARCHIVED}`,
        'GET /api/contacts',
      ]);
      await save();
      await shows(['Ada', 'Bea', 'Cleo']);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(await database.contacts(1)).toBe(3);
    });

    it('removes a selection in one Atomic Operations request through Vue Query, which refetches the list', async () => {
      await database.exec(
        `insert into contacts (id, organization_id, name) values ('${BEA}', 1, 'Bea')`,
      );
      const { user } = contactsScreen();
      await shows(['Ada', 'Bea', 'Old Name']);
      // Nothing selected, nothing to run.
      expect(barButton('Entfernen').disabled).toBe(true);
      await user.click(checkbox('Bea'));
      await user.click(checkbox('Old Name'));
      const from = departures.length;
      await user.click(barButton('Entfernen'));
      await shows(['Ada']);
      await announces('2 Kontakte entfernt.');
      expect(sentFrom(departures, from)).toEqual([
        'POST /api/operations',
        'GET /api/contacts',
      ]);
      expect(departures[from]?.body).toEqual({
        'atomic:operations': [BEA, ARCHIVED].map((id) => ({
          op: 'remove',
          ref: { type: 'contacts', id },
        })),
      });
      expect(await database.contacts(1)).toBe(1);
    });
  },
);
