/**
 * The public names of the contacts application's resources (resource SPEC
 * 4), through the built package: each resource carries both directions of
 * every mapping, recorded in `snapshots/names.json` for review; JavaScript
 * callers get a `TypeError` for each name mistake `fails/names.ts` proves
 * TypeScript refuses; and a derived code that fails, which TypeScript
 * leaves to the runtime, throws when the declaration runs.
 */
import type { ResourceNames } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { Contacts } from './resources/contacts.ts';
import { declareResource } from './resources/declare-resource.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import { declareUntyped, typeErrorOf } from './support/untyped.ts';

/** A resource's names with each map as an object, in the order the map holds its entries. */
function namesRecord(names: ResourceNames): Record<string, unknown> {
  return {
    type: names.type,
    table: names.table,
    id: names.id,
    fields: Object.fromEntries(names.fields),
    relationships: Object.fromEntries(names.relationships),
    columns: Object.fromEntries(names.columns),
    codes: Object.fromEntries(names.codes),
    rules: Object.fromEntries(names.rules),
  };
}

describe('the public names', () => {
  it('match the reviewed snapshot', async () => {
    const record = Object.fromEntries(
      [Organizations, Contacts, Meetings, Notes].map((resource) => [
        resource.table,
        namesRecord(resource.names),
      ]),
    );
    await expect(`${JSON.stringify(record, null, 2)}\n`).toMatchFileSnapshot(
      'snapshots/names.json',
    );
  });

  it('take what the notes declaration gives with as and code', () => {
    expect(Notes.names.fields.get('kind')).toBe('type');
    expect(Notes.names.fields.get('contactName')).toBe('contact');
    expect(Notes.names.relationships.get('author')).toBe('author');
    expect(Notes.names.relationships.get('contact')).toBe('contact_id');
    expect(Notes.names.columns.get('created_at')).toBe('createdAt');
    expect(Notes.names.codes.get('NOTE_PRIORITY_OUT_OF_RANGE')).toBe(
      'notes_priorität_check',
    );
    expect(Notes.names.rules.has('notes_pkey')).toBe(false);
  });

  it('never resolve a name through Object.prototype', () => {
    expect(Notes.names.fields.get('constructor')).toBeUndefined();
    expect(Notes.names.columns.get('__proto__')).toBeUndefined();
  });
});

/** The mistakes of `fails/names.ts`, as JavaScript makes them: `[declaration, message]` over `notes`. */
const NAME_ERRORS: ReadonlyArray<readonly [object, string]> = [
  [
    { operations: ['get'], fields: { type: { access: 'read' } } },
    'notes.fields.type: public name "type" is a member of every resource object; set as',
  ],
  [
    {
      operations: ['get'],
      fields: {},
      relationships: { author: { target: () => Contacts, access: 'read' } },
    },
    'notes.relationships.author: the column does not end in _id; set as',
  ],
  [
    {
      operations: ['get'],
      fields: { contact: { access: 'read' } },
      relationships: { contact_id: { target: () => Contacts, access: 'read' } },
    },
    'notes.relationships.contact_id: public name "contact" collides with fields.contact; set as',
  ],
  [
    {
      operations: ['get'],
      fields: {
        body: { access: 'read' },
        contact: { access: 'read', as: 'body' },
      },
    },
    'notes.fields.contact.as: "body" collides with fields.body',
  ],
  [
    {
      operations: ['get'],
      fields: { created_at: { access: 'read', as: 'lid' } },
    },
    'notes.fields.created_at.as: "lid" is a member of every resource object',
  ],
  [
    {
      as: 'notes.v2',
      operations: ['get'],
      fields: { body: { access: 'read' } },
    },
    'notes.as: "notes.v2" is not a JSON:API member name',
  ],
  [
    {
      operations: ['get'],
      fields: { priorität: { access: 'read' } },
      rules: { notes_priorität_check: { code: 'NOTE_PRIORITÄT' } },
    },
    'notes.rules.notes_priorität_check.code: "NOTE_PRIORITÄT" is not A-Z, 0-9, _',
  ],
  [
    {
      operations: ['get'],
      fields: {
        type: { access: 'read', as: 'kind' },
        body: { access: 'read' },
      },
      rules: { notes_body_check: { code: 'NOTES_TYPE_CHECK' } },
    },
    'notes.rules.notes_type_check: code "NOTES_TYPE_CHECK" collides with notes_body_check; set code',
  ],
  [
    {
      operations: ['get'],
      fields: { body: { access: 'read' } },
      rules: { notes_pkey: { code: 'NOTE_EXISTS' } },
    },
    'notes.rules.notes_pkey.code: the key has no code, since clients cannot violate it',
  ],
];

describe('names JavaScript gets wrong', () => {
  it.each(NAME_ERRORS)('%j', (declaration, message) => {
    expect(typeErrorOf(() => declareUntyped('notes', declaration))).toBe(
      message,
    );
  });
});

describe('derived codes, which only the runtime checks', () => {
  it('a code derived outside A-Z compiles and throws when the declaration runs', () => {
    expect(
      typeErrorOf(() =>
        declareResource('notes', {
          operations: ['get'],
          fields: { priorität: { access: 'read' } },
        }),
      ),
    ).toBe(
      'notes.rules.notes_priorität_check: code "NOTES_PRIORITÄT_CHECK" is not A-Z, 0-9, _; set code',
    );
  });
});
