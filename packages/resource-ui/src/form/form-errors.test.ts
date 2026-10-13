import { describe, expect, it } from 'vitest';

import { ResponseError } from '@nizam-os/jsonapi-client';

import { messages } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { resourceForm } from './resource-form';

const RECORD = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  organization: { type: 'organizations', id: '7' },
};

const edit = resourceForm(Contacts, 'update', {
  messages,
  record: RECORD,
  members: ['name', 'email', 'organization'],
});

/** A refused update whose body is an error document of `errors`. */
function refused(status: number, errors: ReadonlyArray<unknown>) {
  return new ResponseError({
    type: 'contacts',
    call: 'update',
    status,
    body: { errors },
  });
}

function at(pointer: string, detail: string, title = 'Ungültiger Wert') {
  return { status: '422', title, detail, source: { pointer } };
}

describe('errors by field (resource SPEC 20.4)', () => {
  it("puts each object's detail on the member its pointer names, and the rest on the form", () => {
    const errors = edit.errors(
      refused(422, [
        at('/data/attributes/name', 'Name: höchstens 200 Zeichen.'),
        at('/data/attributes/email', 'E-Mail hat nicht die erwartete Form.'),
        at('/data', 'Das Dokument ist unvollständig.'),
      ]),
    );
    expect(errors).toEqual({
      fields: {
        name: 'Name: höchstens 200 Zeichen.',
        email: 'E-Mail hat nicht die erwartete Form.',
      },
      form: ['Das Dokument ist unvollständig.'],
    });
    expect(Object.isFrozen(errors)).toBe(true);
    expect(Object.isFrozen(errors.fields)).toBe(true);
    expect(Object.isFrozen(errors.form)).toBe(true);
  });

  it("places a 409 of a derived code on the constraint's member", () => {
    expect(
      edit.errors(
        refused(409, [
          {
            status: '409',
            code: 'CONTACT_EMAIL_TAKEN',
            title: 'E-Mail vergeben',
            detail: 'Diese E-Mail ist schon vergeben.',
            source: { pointer: '/data/attributes/email' },
          },
        ]),
      ),
    ).toEqual({
      fields: { email: 'Diese E-Mail ist schon vergeben.' },
      form: [],
    });
  });

  it("names a relationship by its pointer, alone or followed by the relationship's data", () => {
    for (const pointer of [
      '/data/relationships/organization',
      '/data/relationships/organization/data',
      '/data/relationships/organization/data/id',
    ]) {
      expect(
        edit.errors(refused(422, [at(pointer, 'Gibt es nicht.')])),
      ).toEqual({ fields: { organization: 'Gibt es nicht.' }, form: [] });
    }
  });

  it('decodes a segment as RFC 6901 does, so an escaped name never matches another member', () => {
    expect(
      edit.errors(
        refused(422, [
          at('/data/attributes/na~1me', 'Eins.'),
          at('/data/attributes/name~0', 'Zwei.'),
          at('/data/attributes/', 'Drei.'),
          at('/data/attributes', 'Vier.'),
        ]),
      ),
    ).toEqual({ fields: {}, form: ['Eins.', 'Zwei.', 'Drei.', 'Vier.'] });
  });

  it('reads a pointer by part: a field under relationships names nothing the form holds', () => {
    expect(
      edit.errors(
        refused(422, [
          at('/data/relationships/name', 'Eins.'),
          at('/data/attributes/organization', 'Zwei.'),
        ]),
      ),
    ).toEqual({ fields: {}, form: ['Eins.', 'Zwei.'] });
  });

  it("keeps a member's first text and gives the form the others, each distinct text once", () => {
    expect(
      edit.errors(
        refused(422, [
          at('/data/attributes/name', 'Zu lang.'),
          at('/data/attributes/name', 'Falsche Form.'),
          at('/data/attributes/email', 'Falsche Form.'),
          at('/data/attributes/name', 'Falsche Form.'),
        ]),
      ),
    ).toEqual({
      fields: { name: 'Zu lang.', email: 'Falsche Form.' },
      form: ['Falsche Form.'],
    });
  });

  it('reads the title of an object without a detail, and leaves out an object with neither', () => {
    expect(
      edit.errors(
        refused(422, [
          {
            title: 'Ungültiger Name',
            source: { pointer: '/data/attributes/name' },
          },
          { status: '422', source: { pointer: '/data/attributes/email' } },
          { code: 'VALIDATION_FAILED' },
        ]),
      ),
    ).toEqual({ fields: { name: 'Ungültiger Name' }, form: [] });
  });

  it("gives the form a member's text when the form does not hold the member, so no refusal goes unseen", () => {
    expect(
      edit.errors(
        refused(422, [
          at('/data/attributes/priority', 'Höchstens 5.'),
          {
            status: '400',
            title: 'Ungültiger Parameter',
            source: { parameter: 'include' },
          },
        ]),
      ),
    ).toEqual({ fields: {}, form: ['Höchstens 5.', 'Ungültiger Parameter'] });
  });

  it('gives nothing for a response whose body is no error document, which the screen words itself', () => {
    const proxy = new ResponseError({
      type: 'contacts',
      call: 'update',
      status: 502,
      body: undefined,
    });
    expect(edit.errors(proxy)).toEqual({ fields: {}, form: [] });
    expect(edit.errors(refused(500, []))).toEqual({ fields: {}, form: [] });
  });

  it.each([
    ['a TypeError', new TypeError('Failed to fetch')],
    [
      'an Error with errors',
      Object.assign(new Error('x'), {
        errors: [at('/data/attributes/name', 'Eins.')],
      }),
    ],
    ['undefined', undefined],
    ['a string', 'Name: höchstens 200 Zeichen.'],
  ])('gives nothing for %s, whose message is for logs', (_, error) => {
    expect(edit.errors(error)).toEqual({ fields: {}, form: [] });
  });

  it('maps a ResponseError of another copy of the client, which carries the brand', () => {
    const foreign = {
      [Symbol.for('@nizam-os/jsonapi-client/response-error')]: true,
      status: 422,
      errors: [at('/data/attributes/name', 'Zu lang.')],
    };
    expect(edit.errors(foreign)).toEqual({
      fields: { name: 'Zu lang.' },
      form: [],
    });
  });
});
