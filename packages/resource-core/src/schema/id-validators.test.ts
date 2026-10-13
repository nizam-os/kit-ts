/**
 * A declared resource's id schema (SPEC 3.4, 6.2, 6.5): `schema.id` and
 * `validate.id` take an id its key's form takes, output it in the spelling
 * the server sends, and refuse any other text with the `ResourceIssue` of
 * the id itself, at the empty path. The JSON:API definition carries it
 * (SPEC 11.1): a create's client id outside it is a 422 at `/data/id`
 * instead of a value PostgreSQL refuses, when the declaration accepts
 * client ids, and an update's id in another spelling of the URL's key
 * names the URL's resource.
 */
import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';
import {
  errorObjects,
  parseCreateDocument,
  parseUpdateDocument,
} from '@nizam-os/jsonapi-core';

import { untypedDeclare } from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';

const declare = untypedDeclare();
const UUID = '0b7c1a9e-4f6d-4d8e-9a3b-2c1d0e9f8a7b';

const Contacts = declare('contacts', {
  operations: ['get'],
  scope: 'organization',
  fields: { name: { access: 'read' } },
});
// An identity BY DEFAULT int8 key, client-keyed or not.
const Meetings = declare('meetings', {
  operations: ['get', 'create'],
  fields: {},
  clientIds: true,
});
const Numbered = declare('meetings', {
  operations: ['get', 'create'],
  fields: {},
});

describe('schema.id and validate.id', () => {
  it("take a uuid key's id and refuse other text", () => {
    expect(Contacts.schema.id.parse(UUID)).toBe(UUID);
    expect(outputOf(Contacts.validate.id, UUID)).toBe(UUID);
    expect(issuesOf(Contacts.validate.id, 'not-a-uuid')).toEqual([
      { code: 'format', expected: 'uuid', path: [] },
    ]);
  });

  it("take an int8 key's id in its one spelling", () => {
    expect(outputOf(Meetings.validate.id, '42')).toBe('42');
    expect(
      ['042', '+42', '42.0', ' 42', '4e1'].map((id) =>
        issuesOf(Meetings.validate.id, id),
      ),
    ).toEqual(
      Array.from({ length: 5 }, () => [
        { code: 'format', expected: 'int64', path: [] },
      ]),
    );
    expect(issuesOf(Meetings.validate.id, '9223372036854775808')).toEqual([
      { code: 'maximum', expected: '9223372036854775807', path: [] },
    ]);
    expect(issuesOf(Meetings.validate.id, 42)).toEqual([
      { code: 'type', expected: 'string', path: [] },
    ]);
  });
});

describe("the JSON:API definition's id", () => {
  it("is the key's, with client ids or without", () => {
    expect(Meetings.resource.validate.id).toBe(Meetings.validate.id);
    expect(Numbered.resource.validate.id).toBe(Numbered.validate.id);
    expect(Contacts.resource.validate.id).toBe(Contacts.validate.id);
  });

  it("names the URL's resource in an update's id in another spelling", async () => {
    const parsed = await parseUpdateDocument(
      Contacts.resource,
      { data: { type: 'contacts', id: UUID } },
      UUID.toUpperCase(),
    );
    expect(parsed.id).toBe(UUID);
    const refusal = await parseUpdateDocument(
      Contacts.resource,
      { data: { type: 'contacts', id: UUID } },
      UUID.replaceAll('-', ''),
    ).catch((error: unknown) => error);
    expect(isBanError(refusal) ? errorObjects(refusal) : []).toMatchObject([
      { code: 'CONFLICT', source: { pointer: '/data/id' } },
    ]);
  });

  it("refuses an id outside the key's form with a 422 at the id", async () => {
    const refusal = await parseCreateDocument(Meetings.resource, {
      data: { type: 'meetings', id: '042' },
    }).catch((error: unknown) => error);
    expect(isBanError(refusal) ? refusal.status : refusal).toBe(422);
    expect(isBanError(refusal) ? errorObjects(refusal) : []).toMatchObject([
      {
        code: 'VALIDATION_FAILED',
        source: { pointer: '/data/id' },
        meta: { code: 'format', expected: 'int64' },
      },
    ]);
    const accepted = await parseCreateDocument(Meetings.resource, {
      data: { type: 'meetings', id: '42' },
    });
    expect(accepted.id).toBe('42');
  });
});
