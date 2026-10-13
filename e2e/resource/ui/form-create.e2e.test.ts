/**
 * The create form over the contacts application (resource SPEC 20.3,
 * 20.4): `resourceForm` from the built `@nizam-os/resource-ui`, with
 * the application's Paraglide messages, writing through the built
 * `@nizam-os/jsonapi-client` to the contacts API served over a socket
 * (`support/contacts-server.ts`), on PGlite and on the server
 * `RESOURCE_PG_URL` names. A person's input is the values a field
 * component holds, and nothing between the form and the database is
 * mocked: the transport records each request as it leaves. The form's
 * own refusals read in the locale of the moment and the server's in the
 * request's, each on its field, and a create leaves every member the
 * person did not touch to the table's defaults.
 * @ref https://paraglidejs.com/server-side-rendering
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resourceForm } from '@nizam-os/resource-ui';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { runtimeDatabases } from '../runtime/database.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { inLocale } from '../support/in-locale.ts';
import { recordedClients, refusal } from '../support/recorded-clients.ts';

/** The create form, built once, as an application builds it at startup. */
const create = resourceForm(Contacts, 'create', { messages: contactMessages });

describe.each(runtimeDatabases())(
  'on %s, a create form of the contacts application',
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

    it("starts a create from the table's defaults and labels each field in the locale of the render", async () => {
      expect(create.defaultValues).toEqual({
        kind: 'person',
        name: '',
        nickname: '',
        email: '',
        website: '',
        status: 'active',
        priority: '',
        discount: '0',
        tags: [],
      });
      expect(create.fields.filter(({ required }) => required)).toEqual([
        expect.objectContaining({ name: 'name' }),
      ]);
      const labels = () => create.fields.map(({ label }) => label());
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
      ]);
      expect((await inLocale('en', labels)).slice(0, 3)).toEqual([
        'Kind',
        'Name',
        'Nickname',
      ]);
    });

    it("refuses what the server would, in the server's words, before anything is sent", async () => {
      const values = {
        ...create.defaultValues,
        website: 'http://engines.example',
        priority: '9',
      };
      const validate = () => create.validator['~standard'].validate(values);
      expect(await inLocale('de', validate)).toEqual({
        issues: [
          { message: 'Name ist erforderlich.', path: ['name'] },
          { message: 'Website hat ein ungültiges Format.', path: ['website'] },
          { message: 'Priorität darf höchstens 5 sein.', path: ['priority'] },
        ],
      });
      expect(await inLocale('en', validate)).toEqual({
        issues: [
          { message: 'Name is required.', path: ['name'] },
          { message: 'Website has an invalid format.', path: ['website'] },
          { message: 'Priority must be at most 5.', path: ['priority'] },
        ],
      });
      expect(() => create.write(values)).toThrow(TypeError);
      expect(departures).toEqual([]);
    });

    it('words a blank required member as the server answers the null the form would send', async () => {
      const { contacts } = clients();
      const error = await refusal(async () =>
        contacts.create({ attributes: { name: null } as never }),
      );
      expect(error.status).toBe(422);
      const validated = await inLocale('de', () =>
        create.validator['~standard'].validate(create.defaultValues),
      );
      expect(create.errors(error)).toEqual({
        fields: { name: 'Name ist erforderlich.' },
        form: [],
      });
      expect(validated).toEqual({
        issues: [{ message: 'Name ist erforderlich.', path: ['name'] }],
      });
    });

    it("creates what the person entered and leaves every member they did not touch to the table's defaults", async () => {
      const { contacts } = clients();
      const values = {
        ...create.defaultValues,
        name: 'Lin Chen',
        email: 'lin@example.com',
        priority: '3',
        tags: ['vip'],
      };
      expect(create.validator['~standard'].validate(values)).toEqual({
        value: values,
      });
      const { data } = await contacts.create(create.write(values));
      expect(departures).toEqual([
        {
          method: 'POST',
          path: '/api/contacts',
          query: '',
          body: {
            data: {
              type: 'contacts',
              attributes: {
                name: 'Lin Chen',
                email: 'lin@example.com',
                priority: 3,
                tags: ['vip'],
              },
            },
          },
        },
      ]);
      expect(data).toMatchObject({
        type: 'contacts',
        kind: 'person',
        name: 'Lin Chen',
        nickname: null,
        email: 'lin@example.com',
        website: null,
        status: 'active',
        priority: 3,
        discount: '0.00',
        tags: ['vip'],
      });
    });

    it("puts a 409 on its field in the server's words, in the language of the request", async () => {
      const values = {
        ...create.defaultValues,
        name: 'Ada Twin',
        email: 'ada@example.com',
      };
      const german = await refusal(async () =>
        clients().contacts.create(create.write(values)),
      );
      expect(german.status).toBe(409);
      expect(create.errors(german)).toEqual({
        fields: { email: 'E-Mail gehört bereits einem anderen Kontakt.' },
        form: [],
      });
      language = 'en-GB';
      const english = await refusal(async () =>
        clients().contacts.create(create.write(values)),
      );
      expect(create.errors(english)).toEqual({
        fields: { email: 'Email already belongs to another contact.' },
        form: [],
      });
      expect(await database.contacts(1)).toBe(2);
    });

    it("puts each item of the server's 422 on its field, for a write no form validated", async () => {
      const error = await refusal(async () =>
        clients().contacts.create({
          attributes: {
            name: '',
            website: 'http://engines.example',
            priority: 9,
          },
        }),
      );
      expect(error.status).toBe(422);
      expect(create.errors(error)).toEqual({
        fields: {
          name: 'Name muss mindestens 1 Zeichen lang sein.',
          website: 'Website hat ein ungültiges Format.',
          priority: 'Priorität darf höchstens 5 sein.',
        },
        form: [],
      });
    });
  },
);
