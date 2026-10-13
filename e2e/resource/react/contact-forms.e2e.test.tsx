/**
 * The contacts application's forms on screen (resource SPEC 20.8): the
 * create and edit screens of `screens/`, rendered by React in jsdom with the
 * built `@nizam-os/resource-ui`, `@nizam-os/tanstack-form-resource`, and
 * `@nizam-os/tanstack-query-jsonapi`, for a person whose browser prefers
 * German, against the application served over a socket
 * (`support/contacts-server.ts`) on PGlite and on the server
 * `RESOURCE_PG_URL` names. Nothing between a keystroke and the database is
 * mocked; the transport records each request as it leaves, with the
 * `Accept-Language` Paraglide's locale gives. The form refuses what the
 * server would before anything is sent, in German; the server's refusals of
 * a taken email and a taken name land on their fields in the German the
 * request asked for, each cleared by the change that answers it; the plan's
 * quota, which no field holds, lands in the banner; and an update sends only
 * what the person changed.
 * @ref https://testing-library.com/docs/user-event/intro
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { QueryClient } from '@tanstack/react-query';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
import { ADA } from '../runtime/seed.ts';
import { contactQueries } from '../support/contact-queries.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedClients } from '../support/recorded-clients.ts';
import { errorOf, preferLanguages } from '../support/screen-person.ts';
import { CreateContact } from './screens/create-contact.tsx';
import { EditContact } from './screens/edit-contact.tsx';
import { renderScreen } from './screens/render-screen.tsx';

const LABELS = ['Name', 'E-Mail', 'Website', 'Status'];

/** The error each field of the create form shows, in order. */
function shownErrors() {
  return LABELS.map((label) => errorOf(label));
}

/** An update of Ada, as the client sends it. */
function patch(attributes: Readonly<Record<string, unknown>>) {
  return {
    method: 'PATCH',
    path: `/api/contacts/${ADA}`,
    body: { data: { type: 'contacts', id: ADA, attributes } },
  };
}

describe.each(runtimeDatabases())(
  "on %s, the contacts application's forms, in German",
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

    /** The screens' queries over the editor's clients, which send Paraglide's locale. */
    function api() {
      return contactQueries(
        recordedClients(server.origin, departures, getLocale),
      );
    }

    /** How many times the contact `id` was read. */
    function reads(id: string) {
      return departures.filter(
        ({ method, path }) =>
          method === 'GET' && path === `/api/contacts/${id}`,
      ).length;
    }

    /** The documents the writes sent, in order. */
    function written() {
      return departures
        .filter(({ method }) => method !== 'GET')
        .map(({ method, path, body }) => ({ method, path, body }));
    }

    /** The create screen, and what the person does on it. */
    function createScreen() {
      const { user } = renderScreen(queryClient, <CreateContact api={api()} />);
      return {
        save: async () => {
          await user.click(screen.getByRole('button', { name: 'Speichern' }));
        },
        retype: async (label: string, text: string) => {
          await user.clear(screen.getByLabelText(label));
          await user.type(screen.getByLabelText(label), text);
        },
      };
    }

    it("refuses what the server would before anything is sent, in the server's German words", async () => {
      const { save, retype } = createScreen();
      expect(shownErrors()).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      await save();
      await waitFor(() => {
        expect(errorOf('Name')).toBe('Name ist erforderlich.');
      });
      await retype('Name', 'Lin Chen');
      await retype('Website', 'http://lin.example');
      await save();
      await waitFor(() => {
        expect(shownErrors()).toEqual([
          undefined,
          undefined,
          'Website hat ein ungültiges Format.',
          undefined,
        ]);
      });
      expect(departures).toEqual([]);
    });

    it("puts a taken email and a taken name on their fields in the server's German, each cleared by the change that answers it, then creates what the person entered", async () => {
      const { save, retype } = createScreen();
      await retype('Name', 'Ada');
      // The column is citext: Ada's email, in other letters.
      await retype('E-Mail', 'ADA@example.com');
      await retype('Website', 'https://ada.example');
      await save();
      await waitFor(() => {
        expect(errorOf('E-Mail')).toBe(
          'E-Mail gehört bereits einem anderen Kontakt.',
        );
      });
      expect(shownErrors()).toEqual([
        undefined,
        'E-Mail gehört bereits einem anderen Kontakt.',
        undefined,
        undefined,
      ]);
      await retype('E-Mail', 'ada.twin@example.com');
      expect(errorOf('E-Mail')).toBeUndefined();
      await save();
      // Acme's active contacts have distinct names.
      await waitFor(() => {
        expect(errorOf('Name')).toBe(
          'Name: Ein anderer Datensatz hat diesen Wert bereits.',
        );
      });
      await retype('Name', 'Ada Twin');
      expect(errorOf('Name')).toBeUndefined();
      await save();
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
      });
      const sent = {
        method: 'POST',
        path: '/api/contacts',
        body: {
          data: {
            type: 'contacts',
            attributes: {
              name: 'Ada',
              email: 'ADA@example.com',
              website: 'https://ada.example',
            },
          },
        },
      };
      expect(written()).toEqual([
        sent,
        {
          ...sent,
          body: {
            data: {
              type: 'contacts',
              attributes: {
                ...sent.body.data.attributes,
                email: 'ada.twin@example.com',
              },
            },
          },
        },
        {
          ...sent,
          body: {
            data: {
              type: 'contacts',
              attributes: {
                name: 'Ada Twin',
                email: 'ada.twin@example.com',
                website: 'https://ada.example',
              },
            },
          },
        },
      ]);
      expect(await database.contacts(1)).toBe(3);
    });

    it('puts a refusal no field holds in the banner: the quota of a full plan', async () => {
      const { save, retype } = createScreen();
      await retype('Name', 'Bea');
      await save();
      await waitFor(() => {
        expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
      });
      // Acme's plan holds three contacts: Ada, Old Name, and Bea.
      await retype('Name', 'Cleo');
      await save();
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Das Kontingent für diesen Vorgang ist aufgebraucht.',
      );
      expect(shownErrors()).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(await database.contacts(1)).toBe(3);
    });

    it('sends only the members the person changed, measured against the record as it refetched, a cleared input as null', async () => {
      const { user } = renderScreen(
        queryClient,
        <EditContact api={api()} id={ADA} />,
      );
      const name = await screen.findByLabelText<HTMLInputElement>('Name');
      expect(name.value).toBe('Ada');
      const nickname = screen.getByLabelText('Spitzname');
      /** Saves, and waits for the record to refetch. */
      const save = async () => {
        const before = reads(ADA);
        await user.click(screen.getByRole('button', { name: 'Speichern' }));
        await waitFor(() => {
          expect(reads(ADA)).toBe(before + 1);
        });
      };
      await user.type(nickname, 'Countess');
      await save();
      await user.clear(name);
      await user.type(name, 'Ada Lovelace');
      await save();
      await user.clear(nickname);
      await save();
      expect(written()).toEqual([
        patch({ nickname: 'Countess' }),
        patch({ name: 'Ada Lovelace' }),
        patch({ nickname: null }),
      ]);
      expect(await screen.findByRole('status')).toHaveProperty(
        'textContent',
        'Gespeichert',
      );
    });
  },
);
