/**
 * The update form over the contacts application (resource SPEC 20.3,
 * 20.4): `resourceForm` from the built `@nizam-os/resource-ui`, started
 * from the record the built `@nizam-os/jsonapi-client` read from the
 * contacts API served over a socket, on PGlite and on the server
 * `RESOURCE_PG_URL` names, nothing mocked. An update sends what the
 * person changed and nothing else, so every other stored value stays; a
 * cleared input is sent as `null`, and a member that is not nullable
 * refuses it on its field before anything is sent (ADR 0016).
 * @ref https://jsonapi.org/format/1.1/#crud-updating-resource-attributes
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resourceForm } from '@nizam-os/resource-ui';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { runtimeDatabases } from '../runtime/database.ts';
import { ADA } from '../runtime/seed.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { inLocale } from '../support/in-locale.ts';
import { recordedClients } from '../support/recorded-clients.ts';

/** The record a write answered with; the contacts API answers every write with one. */
function stored<TRecord>(record: TRecord | undefined): TRecord {
  if (record === undefined) {
    throw new Error('the write answered without a record');
  }
  return record;
}

describe.each(runtimeDatabases())(
  'on %s, an update form of the contacts application',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    let language = 'de';
    const departures: Array<Departure> = [];

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
      departures.length = 0;
      language = 'de';
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    /** The application's clients, as editor, in `language`, each request recorded. */
    function clients() {
      return recordedClients(server.origin, departures, () => language);
    }

    it('edits the record the client read, sending only what the person changed', async () => {
      const { contacts } = clients();
      const { data: ada } = await contacts.get(ADA);
      const edit = resourceForm(Contacts, 'update', {
        messages: contactMessages,
        record: ada,
      });
      expect(edit.defaultValues).toEqual({
        name: 'Ada',
        nickname: '',
        email: 'ada@example.com',
        website: '',
        status: 'active',
        priority: '',
        discount: '0.00',
        tags: [],
      });
      const values = {
        ...edit.defaultValues,
        nickname: 'Countess',
        priority: '2',
      };
      const { data: updated } = await contacts.update(ADA, edit.write(values));
      expect(departures.at(-1)).toEqual({
        method: 'PATCH',
        path: `/api/contacts/${ADA}`,
        query: '',
        body: {
          data: {
            type: 'contacts',
            id: ADA,
            attributes: { nickname: 'Countess', priority: 2 },
          },
        },
      });
      expect(updated).toEqual({ ...ada, nickname: 'Countess', priority: 2 });
      const again = resourceForm(Contacts, 'update', {
        messages: contactMessages,
        record: stored(updated),
      });
      const { data: cleared } = await contacts.update(
        ADA,
        again.write({ ...again.defaultValues, nickname: '' }),
      );
      expect(departures.at(-1)?.body).toEqual({
        data: { type: 'contacts', id: ADA, attributes: { nickname: null } },
      });
      expect(cleared).toEqual({ ...ada, priority: 2 });
    });

    it('refuses to clear a member that is not nullable, on its field, and sends nothing', async () => {
      const { data: ada } = await clients().contacts.get(ADA);
      const edit = resourceForm(Contacts, 'update', {
        messages: contactMessages,
        record: ada,
      });
      const values = { ...edit.defaultValues, name: '' };
      expect(
        await inLocale('de', () =>
          edit.validator['~standard'].validate(values),
        ),
      ).toEqual({
        issues: [{ message: 'Name ist erforderlich.', path: ['name'] }],
      });
      expect(() => edit.write(values)).toThrow(
        "resourceForm.write: the values do not pass the form's validator",
      );
      expect(departures.map(({ method }) => method)).toEqual(['GET']);
    });
  },
);
