/**
 * A refused action's error objects by member (resource SPEC 21.2, 21.3): a
 * record's on the members of the resource, as a form's (SPEC 20.4); a
 * selection's on the record at its operation's index (jsonapi SPEC 17.3) and
 * the member the rest of its pointer names; an index outside the selection
 * and an object that names no operation on the selection; and nothing for an
 * error that is no `ResponseError`.
 */
import { describe, expect, it } from 'vitest';

import { ResponseError } from '@nizam-os/jsonapi-client';

import { message, text } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

const label = text('Archivieren', 'Archive');
const ARCHIVED = { attributes: { status: 'archived' } };
const row = recordActions(Contacts, {
  actions: { archive: { label, update: ARCHIVED } },
}).archive;
const bar = bulkActions(Contacts, {
  tooMany: message<{ max: number }>(
    ({ max }) => `Höchstens ${max}.`,
    ({ max }) => `At most ${max}.`,
  ),
  actions: { archive: { label, update: ARCHIVED } },
}).archive;
const IDS = ['c1', 'c2', 'c3'];

/** An error object at `pointer` with `detail`; no source without a pointer. */
function at(pointer: string | undefined, detail: string) {
  return pointer === undefined
    ? { status: '422', detail }
    : { status: '422', detail, source: { pointer } };
}

/** A refused request whose body is an error document of `errors`. */
function refused(call: string, errors: ReadonlyArray<unknown>) {
  return new ResponseError({
    type: 'contacts',
    call,
    status: 422,
    body: { errors },
  });
}

describe("a record action's refusal (resource SPEC 21.2)", () => {
  it('puts each text on the member of the resource its pointer names, any member a row shows', () => {
    const error = refused('update', [
      at('/data/attributes/name', 'Name vergeben.'),
      at('/data/relationships/organization', 'In dieser Organisation.'),
      at('/data/attributes/tags/1', 'Doppelt.'),
      at('/data/attributes/createdAt', 'Zu früh.'),
    ]);

    expect(row.errors(error)).toStrictEqual({
      fields: {
        name: 'Name vergeben.',
        organization: 'In dieser Organisation.',
        tags: 'Doppelt.',
        createdAt: 'Zu früh.',
      },
      form: [],
    });
  });

  it('gives the form a text whose pointer names no member under its part, or none, each distinct text once', () => {
    const error = refused('update', [
      at('/data/attributes/organization', 'Teil falsch.'),
      at('/data/relationships/name', 'Teil falsch.'),
      at('/data/attributes/nope', 'Unbekannt.'),
      at('/data/attributes/constructor', 'Unbekannt.'),
      at(undefined, 'Abgelehnt.'),
      at('/data/attributes/name', 'Zuerst.'),
      at('/data/attributes/name', 'Danach.'),
    ]);

    expect(row.errors(error)).toStrictEqual({
      fields: { name: 'Zuerst.' },
      form: ['Teil falsch.', 'Unbekannt.', 'Abgelehnt.', 'Danach.'],
    });
  });

  it('gives nothing for an error that is no ResponseError, which the screen words itself', () => {
    expect(row.errors(new TypeError('Failed to fetch'))).toStrictEqual({
      fields: {},
      form: [],
    });
  });

  it('maps a ResponseError of another copy of the client, which carries the brand', () => {
    const foreign = {
      [Symbol.for('@nizam-os/jsonapi-client/response-error')]: true,
      status: 422,
      errors: [at('/data/attributes/name', 'Zu lang.')],
    };

    expect(row.errors(foreign)).toStrictEqual({
      fields: { name: 'Zu lang.' },
      form: [],
    });
  });
});

describe("a selection's refusal (resource SPEC 21.3)", () => {
  it("puts each object on the record at its operation's index, and on the member the rest of its pointer names", () => {
    const error = refused('operations', [
      at('/atomic:operations/1/data/attributes/name', 'Name vergeben.'),
      at('/atomic:operations/1/data/relationships/organization/data', 'Dort.'),
      at('/atomic:operations/2', 'Nicht gefunden.'),
    ]);

    expect(bar.errors(error, IDS)).toStrictEqual({
      records: {
        c2: {
          fields: { name: 'Name vergeben.', organization: 'Dort.' },
          form: [],
        },
        c3: { fields: {}, form: ['Nicht gefunden.'] },
      },
      form: [],
    });
  });

  it('gives the selection an object at an index outside it, and one that names no operation, each distinct text once', () => {
    const error = refused('operations', [
      at('/atomic:operations/3/data/attributes/name', 'Außerhalb.'),
      at('/atomic:operations', 'Zu viele.'),
      at('/data/attributes/name', 'Kein Vorgang.'),
      at(undefined, 'Zu viele.'),
      at('/atomic:operations/01', 'Kein Index.'),
    ]);

    expect(bar.errors(error, IDS)).toStrictEqual({
      records: {},
      form: ['Außerhalb.', 'Zu viele.', 'Kein Vorgang.', 'Kein Index.'],
    });
  });

  it('gives nothing for an error that is no ResponseError', () => {
    expect(bar.errors(new TypeError('Failed to fetch'), IDS)).toStrictEqual({
      records: {},
      form: [],
    });
  });

  it('maps a ResponseError of another copy of the client, which carries the brand', () => {
    const foreign = {
      [Symbol.for('@nizam-os/jsonapi-client/response-error')]: true,
      status: 404,
      errors: [at('/atomic:operations/0', 'Nicht gefunden.')],
    };

    expect(bar.errors(foreign, IDS)).toStrictEqual({
      records: { c1: { fields: {}, form: ['Nicht gefunden.'] } },
      form: [],
    });
  });
});
