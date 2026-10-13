/**
 * A row's actions on screen (resource SPEC 21.5): the contacts list with a
 * menu in each row (`screens/contact-actions.tsx`), rendered by React in
 * jsdom with the built `@nizam-os/resource-ui` and
 * `@nizam-os/tanstack-query-jsonapi`, TanStack Query, and Table v9, for a
 * person whose browser prefers German, against the application served over a
 * socket (`support/contacts-server.ts`) on PGlite and on the server
 * `RESOURCE_PG_URL` names. Nothing between a click and the database is
 * mocked; the transport records each request as it leaves. A removal waits
 * for the person's confirmation, and an archive does not; each sends the
 * client's own call, which refetches the list, and the menu then offers what
 * the record's new state allows. A removal the database refuses lands in the
 * alert, since its text names no member, and refetches nothing.
 * `selection-actions.e2e.test.tsx` runs the bar's.
 * @ref https://testing-library.com/docs/user-event/intro
 * @ref https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { QueryClient } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
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
import { ADA, ARCHIVED } from '../runtime/seed.ts';
import {
  announces,
  listed,
  menuOf,
  refusalOf,
  rowButton,
  shows,
} from '../support/action-screen.ts';
import { contactActionQueries } from '../support/contact-queries.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedTransport, sentFrom } from '../support/recorded-clients.ts';
import { preferLanguages } from '../support/screen-person.ts';
import { contactActionsScreen } from './screens/contact-actions.tsx';
import { renderScreen } from './screens/render-screen.tsx';

describe.each(runtimeDatabases())(
  "on %s, a row's actions, in German",
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

    /** The list of every contact, under the editor's transport. */
    function actionsScreen() {
      const api = contactActionQueries(
        recordedTransport(server.origin, departures, getLocale),
      );
      return renderScreen(queryClient, contactActionsScreen(api, {}));
    }

    it('removes a contact from its row once the person confirms it, refetching the list', async () => {
      const { user } = actionsScreen();
      await shows(['Ada: Aktiv', 'Old Name: Archiviert']);
      // An archived contact's row offers no archive.
      expect([menuOf('Ada'), menuOf('Old Name')]).toEqual([
        ['Archivieren', 'Entfernen'],
        ['Entfernen'],
      ]);
      const from = departures.length;
      await user.click(rowButton('Old Name', 'Entfernen'));
      const dialog = screen.getByRole('dialog', {
        name: 'Old Name entfernen?',
      });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(
        within(dialog).getByText('Das lässt sich nicht rückgängig machen.').id,
      ).toBe(dialog.getAttribute('aria-describedby'));
      await user.click(
        within(dialog).getByRole('button', { name: 'Abbrechen' }),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(sentFrom(departures, from)).toEqual([]);
      await user.click(rowButton('Old Name', 'Entfernen'));
      // Without a label of its own, the confirming button is the action's.
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Entfernen',
        }),
      );
      await shows(['Ada: Aktiv']);
      await announces('Old Name entfernt.');
      expect(sentFrom(departures, from)).toEqual([
        `DELETE /api/contacts/${ARCHIVED}`,
        'GET /api/contacts',
      ]);
      expect(await database.contacts(1)).toBe(1);
    });

    it('archives a contact from its row in one update that refetches the list, after which the row offers no archive', async () => {
      const { user } = actionsScreen();
      await shows(['Ada: Aktiv', 'Old Name: Archiviert']);
      const from = departures.length;
      await user.click(rowButton('Ada', 'Archivieren'));
      await shows(['Ada: Archiviert', 'Old Name: Archiviert']);
      await announces('Ada archiviert.');
      expect(sentFrom(departures, from)).toEqual([
        `PATCH /api/contacts/${ADA}`,
        'GET /api/contacts',
      ]);
      expect(departures[from]?.body).toEqual({
        data: {
          type: 'contacts',
          id: ADA,
          attributes: { status: 'archived' },
        },
      });
      expect(menuOf('Ada')).toEqual(['Entfernen']);
    });

    it('puts a removal the database refuses in the alert, the row kept as it was', async () => {
      const { user } = actionsScreen();
      await shows(['Ada: Aktiv', 'Old Name: Archiviert']);
      const from = departures.length;
      await user.click(rowButton('Ada', 'Entfernen'));
      await user.click(
        within(
          screen.getByRole('dialog', { name: 'Ada entfernen?' }),
        ).getByRole('button', { name: 'Entfernen' }),
      );
      // Ada's meeting has no notes, so its CHECK refuses the meeting
      // without its contact that ON DELETE SET NULL would leave.
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Die Anfrage steht im Konflikt mit dem aktuellen Zustand der Ressource.',
      );
      // The text names no member, so it marks no row.
      expect(refusalOf('Ada')).toEqual({});
      expect(sentFrom(departures, from)).toEqual([
        `DELETE /api/contacts/${ADA}`,
      ]);
      expect(listed()).toEqual(['Ada: Aktiv', 'Old Name: Archiviert']);
      expect(await database.contacts(1)).toBe(2);
    });
  },
);
