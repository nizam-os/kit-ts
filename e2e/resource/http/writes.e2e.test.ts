/**
 * The contacts slice's writes over a socket (epic #32; resource SPEC 19.3,
 * 19.6): `@hono/node-server` serves the routes of `@nizam-os/hono-resource`
 * over the runtime, on PGlite and on the server `RESOURCE_PG_URL` names,
 * and every answer is held to the document the server serves
 * (`support/contacts-server.ts`). A create fills what it leaves out from
 * the table's defaults; an update writes only the members it sends, and
 * `null` clears one; a member a create does not write is refused 403 at
 * its pointer before any validator runs; a request with several problems
 * answers each with its code, its pointer, and a message in the request's
 * language, under the status they share; and a unique violation answers
 * 409 in the request's language. Nothing refused writes a row.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-resource-attributes ("the server MUST interpret the missing attributes as if they were included with their current values")
 * @ref https://jsonapi.org/format/1.1/#errors-processing
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { localizeIssues } from '@nizam-os/resource-core';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { runtimeDatabases } from '../runtime/database.ts';
import { ADA } from '../runtime/seed.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import { inLocale } from '../support/in-locale.ts';
import { attributesOf, idOf, problemsOf } from '../support/slice-answers.ts';

const CREATED = 201;

/** A create's request document of `attributes`. */
function contact(attributes: Record<string, unknown>) {
  return { data: { type: 'contacts', attributes } };
}

/** An update's request document of Ada's `attributes`. */
function adaWith(attributes: Record<string, unknown>) {
  return { data: { type: 'contacts', id: ADA, attributes } };
}

describe.each(runtimeDatabases())(
  'on %s, the contacts API over a socket',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    it("creates a contact from its name alone, the rest from the table's defaults", async () => {
      const sent = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', body: contact({ name: 'Lin' }) },
      );
      expect(sent.status).toBe(CREATED);
      const { createdAt, ...attributes } = attributesOf(sent);
      expect(attributes).toEqual({
        kind: 'person',
        name: 'Lin',
        nickname: null,
        email: null,
        website: null,
        status: 'active',
        priority: null,
        discount: '0.00',
        tags: [],
      });
      expect(Number.isNaN(Date.parse(String(createdAt)))).toBe(false);
      expect(sent.headers.get('Location')).toBe(`/api/contacts/${idOf(sent)}`);
      const read = await server.exchange(
        'get',
        '/api/contacts/{id}',
        `/api/contacts/${idOf(sent)}`,
        { actor: 'editor' },
      );
      expect(attributesOf(read)).toEqual(attributesOf(sent));
    });

    it('updates only the members it sends, and clears one sent as null', async () => {
      const path = `/api/contacts/${ADA}`;
      const before = await server.exchange('get', '/api/contacts/{id}', path, {
        actor: 'editor',
      });
      const nicknamed = await server.exchange(
        'patch',
        '/api/contacts/{id}',
        path,
        {
          actor: 'editor',
          body: adaWith({ nickname: 'Countess', priority: 2 }),
        },
      );
      expect(attributesOf(nicknamed)).toEqual({
        ...attributesOf(before),
        nickname: 'Countess',
        priority: 2,
      });
      const cleared = await server.exchange(
        'patch',
        '/api/contacts/{id}',
        path,
        { actor: 'editor', body: adaWith({ nickname: null }) },
      );
      expect(attributesOf(cleared)).toEqual({
        ...attributesOf(before),
        priority: 2,
      });
    });

    it('refuses a member a create does not write before any validator runs', async () => {
      const body = contact({ name: '', createdAt: '2026-01-01T00:00:00Z' });
      const german = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'de', body },
      );
      expect(problemsOf(german)).toEqual([
        403,
        [
          '403',
          'FORBIDDEN',
          '/data/attributes/createdAt',
          'Verboten',
          'Die Anfrage ist nicht erlaubt.',
        ],
      ]);
      const english = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'en', body },
      );
      expect(problemsOf(english)).toEqual([
        403,
        [
          '403',
          'FORBIDDEN',
          '/data/attributes/createdAt',
          'Forbidden',
          'The request is not allowed.',
        ],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });

    it("answers each problem of a request with its code, its pointer, and a message in the request's language", async () => {
      const body = contact({
        name: '',
        website: 'http://engines.example',
        priority: 9,
      });
      const german = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'de', body },
      );
      expect(problemsOf(german)).toEqual([
        422,
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/name',
          'Validierung fehlgeschlagen',
          'Name muss mindestens 1 Zeichen lang sein.',
        ],
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/website',
          'Validierung fehlgeschlagen',
          'Website hat ein ungültiges Format.',
        ],
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/priority',
          'Validierung fehlgeschlagen',
          'Priorität darf höchstens 5 sein.',
        ],
      ]);
      const english = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'en', body },
      );
      expect(problemsOf(english)).toEqual([
        422,
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/name',
          'Validation Failed',
          'Name must be at least 1 character long.',
        ],
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/website',
          'Validation Failed',
          'Website has an invalid format.',
        ],
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/priority',
          'Validation Failed',
          'Priority must be at most 5.',
        ],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });

    it("gives a client that validates the same body first the server's words for each refusal, in either language", async () => {
      const attributes = {
        name: '',
        website: 'http://engines.example',
        priority: 9,
      };
      const issues =
        Contacts.write.create['~standard'].validate({
          attributes,
          relationships: {},
        }).issues ?? [];
      const textOf = localizeIssues(contactMessages);
      for (const language of ['de', 'en']) {
        const served = await server.exchange(
          'post',
          '/api/contacts',
          '/api/contacts',
          { actor: 'editor', language, body: contact(attributes) },
        );
        const details = problemsOf(served)
          .slice(1)
          .map((problem) => (problem as ReadonlyArray<unknown>)[4]);
        const texts = await inLocale(language, () =>
          issues.map((issue) => textOf('contacts', issue)),
        );
        expect(texts).toEqual(details);
        expect(texts).toHaveLength(3);
      }
    });

    it('answers a unique violation 409 in German, and in English for an English client', async () => {
      const body = contact({ name: 'Ada Twin', email: 'ada@example.com' });
      const german = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'de-AT,de;q=0.9', body },
      );
      expect(problemsOf(german)).toEqual([
        409,
        [
          '409',
          'CONTACT_EMAIL_TAKEN',
          '/data/attributes/email',
          'E-Mail vergeben',
          'E-Mail gehört bereits einem anderen Kontakt.',
        ],
      ]);
      const english = await server.exchange(
        'post',
        '/api/contacts',
        '/api/contacts',
        { actor: 'editor', language: 'en-GB', body },
      );
      expect(problemsOf(english)).toEqual([
        409,
        [
          '409',
          'CONTACT_EMAIL_TAKEN',
          '/data/attributes/email',
          'Email Taken',
          'Email already belongs to another contact.',
        ],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });
  },
);
