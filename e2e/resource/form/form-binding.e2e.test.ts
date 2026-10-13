/**
 * TanStack Form over the contacts application (resource SPEC 20.5, ADR
 * 0017): a form-core `FormApi` made with `resourceFormOptions` of the built
 * `@nizam-os/tanstack-form-resource`, as every adapter's form is made, whose
 * submit handler writes through the built `@nizam-os/jsonapi-client` to the
 * application served over a socket (`support/contacts-server.ts`, with
 * meetings, `runtime/meetings.ts`) and binds a refusal with
 * `bindResponseErrors`, as an application's handler does, on PGlite and on
 * the server `RESOURCE_PG_URL` names. A person's input is `handleChange` and
 * `handleBlur` on the form's fields, and what they see is each field's
 * errors' messages; the transport records each request as it leaves, so a
 * submit the form blocked sent nothing. A taken email is a refusal of one
 * field, which stays on it until the email changes; a room booked twice for
 * one period is a refusal of the room and the period together, which
 * changing either answers.
 * @ref https://tanstack.com/form/v1/docs/framework/react/guides/validation
 */
import type { FormModel } from '@nizam-os/resource-ui';

import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { FieldApi, FormApi } from '@tanstack/form-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { defaultMessages } from '@nizam-os/resource-core';
import { resourceForm } from '@nizam-os/resource-ui';
import {
  bindResponseErrors,
  resourceFormOptions,
} from '@nizam-os/tanstack-form-resource';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Organizations } from '../resources/organizations.ts';
import { runtimeDatabases } from '../runtime/database.ts';
import { openMeetingsRuntime } from '../runtime/meetings.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { recordedClients } from '../support/recorded-clients.ts';

/** The forms, built once, as an application builds them at startup. */
const create = resourceForm(Contacts, 'create', {
  messages: contactMessages,
  members: ['name', 'email'],
});
const book = resourceForm(Meetings, 'create', {
  messages: defaultMessages([Organizations, Contacts, Meetings]),
});

/** What the server answers for a booking that overlaps Ada's meeting, from the constant English texts. */
const DOUBLE_BOOKED = 'The value conflicts with another record.';

/** Ada's meeting, which the seed books in room a-1. */
const ADAS_MEETING = {
  start: '2026-01-05T09:00:00Z',
  end: '2026-01-05T10:00:00Z',
};

/**
 * A screen's form over `model`, with a field for each member it holds,
 * whose submit handler sends the model's write and binds a refusal.
 */
function screen(
  model: FormModel<any, unknown>,
  send: (write: unknown) => Promise<unknown>,
) {
  const form = new FormApi({
    ...resourceFormOptions(model),
    onSubmit: async ({ value, formApi }) => {
      try {
        await send(model.write(value));
      } catch (error) {
        bindResponseErrors(formApi, model, error);
      }
    },
  });
  form.mount();
  const fields = new Map(
    model.fields.map(({ name }) => {
      const field = new FieldApi({ form, name });
      field.mount();
      return [name, field] as const;
    }),
  );
  const field = (name: string) => {
    const found = fields.get(name);
    if (found === undefined) {
      throw new Error(`the form holds no ${name}`);
    }
    return found;
  };
  return {
    form,
    field,
    /** What the field component of `name` renders. */
    shown: (name: string): Array<string> =>
      field(name).state.meta.errors.map(
        (error: { message: string }) => error.message,
      ),
  };
}

describe.each(runtimeDatabases())(
  'on %s, a TanStack Form of the contacts application',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    const departures: Array<Departure> = [];

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
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    /** The application's clients, as editor, in English, each request recorded. */
    function clients() {
      return recordedClients(server.origin, departures, () => 'en');
    }

    it('keeps a taken email on its field until the email changes, and sends nothing before', async () => {
      const { contacts } = clients();
      const person = screen(create, async (write) =>
        contacts.create(write as never),
      );
      await person.form.handleSubmit();
      expect(departures).toEqual([]);
      expect(person.shown('name')).toEqual(['Name is required.']);
      person.field('name').handleChange('Ada Twin');
      person.field('email').handleChange('ada@example.com');
      expect(person.shown('name')).toEqual([]);
      await person.form.handleSubmit();
      expect(departures).toHaveLength(1);
      expect(person.form.state.isSubmitSuccessful).toBe(true);
      expect(person.shown('email')).toEqual([
        'Email already belongs to another contact.',
      ]);
      expect(person.field('email').state.meta.errorMap.onSubmit).toEqual({
        message: 'Email already belongs to another contact.',
      });
      person.field('name').handleChange('Ada Lovelace Twin');
      person.field('name').handleBlur();
      await person.form.handleSubmit();
      expect(departures).toHaveLength(1);
      expect(person.shown('email')).toEqual([
        'Email already belongs to another contact.',
      ]);
      person.field('email').handleChange('ada.twin@example.com');
      expect(person.shown('email')).toEqual([]);
      await person.form.handleSubmit();
      expect(departures.at(-1)).toEqual({
        method: 'POST',
        path: '/api/contacts',
        query: '',
        body: {
          data: {
            type: 'contacts',
            attributes: {
              name: 'Ada Lovelace Twin',
              email: 'ada.twin@example.com',
            },
          },
        },
      });
      expect(departures).toHaveLength(2);
      expect(await database.contacts(1)).toBe(3);
    });

    it.each([
      [
        'the period',
        'during',
        { start: '2026-01-05T10:00:00Z', end: '2026-01-05T11:00:00Z' },
      ],
      ['the room', 'room', 'a-2'],
    ] as const)(
      'clears a double booking from the room and the period when the person changes %s, and books it',
      async (_member, name, value) => {
        const { meetings } = clients();
        const person = screen(book, async (write) =>
          meetings.create(write as never),
        );
        person.field('room').handleChange('a-1');
        person.field('during').handleChange({
          start: '2026-01-05T09:30:00Z',
          end: '2026-01-05T10:30:00Z',
        });
        person.field('notes').handleChange('Planning');
        await person.form.handleSubmit();
        expect(departures).toHaveLength(1);
        expect(person.shown('room')).toEqual([DOUBLE_BOOKED]);
        expect(person.shown('during')).toEqual([DOUBLE_BOOKED]);
        expect(person.field('room').state.meta.errorMap.onServer).toEqual({
          message: DOUBLE_BOOKED,
        });
        await person.form.handleSubmit();
        expect(departures).toHaveLength(1);
        person.field(name).handleChange(value);
        expect(person.shown('room')).toEqual([]);
        expect(person.shown('during')).toEqual([]);
        await person.form.handleSubmit();
        expect(departures).toHaveLength(2);
        const { data } = await meetings.list({ sort: ['room'] });
        expect(
          data.map(({ room, during, notes }) => ({ room, during, notes })),
        ).toEqual(
          name === 'room'
            ? [
                { room: 'a-1', during: ADAS_MEETING, notes: null },
                {
                  room: 'a-2',
                  during: {
                    start: '2026-01-05T09:30:00Z',
                    end: '2026-01-05T10:30:00Z',
                  },
                  notes: 'Planning',
                },
              ]
            : [
                { room: 'a-1', during: ADAS_MEETING, notes: null },
                { room: 'a-1', during: value, notes: 'Planning' },
              ],
        );
      },
    );
  },
);
