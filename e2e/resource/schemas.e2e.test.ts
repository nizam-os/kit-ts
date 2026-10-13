/**
 * The contacts application's schemas (resource SPEC 6), through the built
 * package over the catalog `pg-catalog extract` wrote: the members each
 * operation takes, what create requires, the issues on public paths, the
 * linkage schemas, the write validators that run the CHECKs spanning a
 * field and a relationship, the types `Infer` reads from the emitted
 * declarations, and the boundary fixtures of the `testing` entry.
 */
import type { Infer, ResourceIssue } from '@nizam-os/resource-core';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { boundaryFixtures } from '@nizam-os/resource-core/testing';

import { Contacts } from './resources/contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';

interface Validator {
  readonly '~standard': {
    readonly validate: (value: unknown) => unknown;
  };
}

/** The issues of a validation as `[code, path, expected]`, or `[]` when it passes. */
function issuesOf(validator: Validator, value: unknown) {
  const result = validator['~standard'].validate(value) as {
    readonly issues?: ReadonlyArray<ResourceIssue>;
  };
  return (result.issues ?? []).map(({ code, path, expected }) =>
    expected === undefined
      ? [code, path.join('/')]
      : [code, path.join('/'), expected],
  );
}

const DURING = { start: '2026-03-02T09:00:00Z', end: '2026-03-02T10:30:00Z' };
const CONTACT_ID = '0e2f7c64-8d43-4b6e-9a51-2f3c8b9d1a07';
const keys = (schema: { readonly shape: object }) => Object.keys(schema.shape);
const accepts = (value: unknown) =>
  Meetings.linkage.create.safeParse(value).success;
const write = (attributes: object, relationships: object) =>
  issuesOf(Meetings.write.update, { attributes, relationships });
const labels = (name: string) =>
  (boundaryFixtures(Contacts).fields[name] ?? []).map(({ label }) => label);

describe('the operation schemas (SPEC 6.2, 6.3)', () => {
  it('take the members each access allows, under their public names', () => {
    expect(keys(Contacts.schema.read)).toEqual([
      'kind',
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'discount',
      'tags',
      'createdAt',
    ]);
    expect(keys(Contacts.schema.create)).toEqual([
      'kind',
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'discount',
      'tags',
    ]);
    expect(keys(Contacts.schema.update)).toEqual([
      'name',
      'nickname',
      'email',
      'website',
      'status',
      'priority',
      'discount',
      'tags',
    ]);
    expect(keys(Notes.schema.create)).toEqual([
      'kind',
      'contactName',
      'body',
      'priorität',
    ]);
    expect(keys(Notes.linkage.read)).toEqual([
      'organization',
      'author',
      'contact',
    ]);
    expect(keys(Notes.linkage.create)).toEqual(['author', 'contact']);
    expect(keys(Notes.linkage.update)).toEqual(['contact']);
  });

  it('require on create exactly the columns required on insert', () => {
    expect(issuesOf(Contacts.validate.create, {})).toEqual([
      ['required', 'name'],
    ]);
    expect(issuesOf(Organizations.validate.create, {})).toEqual([
      ['required', 'name'],
      ['required', 'slug'],
    ]);
    expect(issuesOf(Meetings.validate.create, {})).toEqual([
      ['required', 'room'],
      ['required', 'during'],
    ]);
    expect(issuesOf(Notes.validate.create, {})).toEqual([
      ['required', 'kind'],
      ['required', 'body'],
    ]);
    expect(issuesOf(Contacts.validate.update, {})).toEqual([]);
  });

  it('give back exactly the members sent, with no default filled in (ADR 0004)', () => {
    expect(Contacts.schema.create.parse({ name: 'Ada' })).toEqual({
      name: 'Ada',
    });
    expect(Contacts.schema.update.parse({ nickname: undefined })).toEqual({});
    expect(
      Meetings.schema.create.parse({ room: 'lobby', during: DURING }),
    ).toEqual({
      room: 'lobby',
      during: DURING,
    });
  });

  it('strip unknown keys on read and refuse them on create and update', () => {
    expect(
      Organizations.schema.read.parse({
        name: 'Acme',
        slug: 'acme',
        handle: null,
        seats: 5,
        country: null,
        createdAt: '2026-03-02T09:00:00Z',
        plan: 'gold',
      }),
    ).not.toHaveProperty('plan');
    expect(issuesOf(Organizations.validate.update, { plan: 'gold' })).toEqual([
      ['additionalProperties', 'plan'],
    ]);
  });
});

describe('issues (SPEC 6.4)', () => {
  it('report every refused rule under its public name with its keyword', () => {
    expect(
      issuesOf(Contacts.validate.create, {
        name: '',
        email: 'ada.example.com',
        website: 'http://example.com',
        status: 'gone',
        priority: 9,
        discount: '100.001',
        tags: ['vip', null],
      }),
    ).toEqual([
      ['minLength', 'name', '1'],
      ['EMAIL_CHECK', 'email'],
      ['pattern', 'website', '^https://'],
      ['enum', 'status', '["active","archived"]'],
      ['maximum', 'priority', '5'],
      ['multipleOf', 'discount', '0.01'],
      ['maximum', 'discount', '100'],
      ['type', 'tags/1', 'string'],
    ]);
  });

  it('carry the code a rule gives its validator, and messages without request data', () => {
    const result = Meetings.validate.update['~standard'].validate({
      room: 'Lobby-2',
    });
    expect(result).toEqual({
      issues: [
        {
          code: 'MEETING_ROOM_NOT_LOWERCASE',
          path: ['room'],
          message: 'The value violates a constraint.',
        },
      ],
    });
  });
});

describe('relationships and writes (SPEC 6.2, 7.2)', () => {
  it('take a linkage with the target type and the target id form', () => {
    expect(accepts({ contact: { type: 'contacts', id: CONTACT_ID } })).toBe(
      true,
    );
    expect(accepts({ contact: null })).toBe(true);
    expect(accepts({ contact: { type: 'contacts', id: 'ada' } })).toBe(false);
    expect(
      Contacts.linkage.read.safeParse({
        organization: { type: 'organizations', id: '+1' },
      }).success,
    ).toBe(false);
    // The linkage schemas are Zod's; the write validators report their issues.
    expect(
      issuesOf(Meetings.write.update, {
        attributes: {},
        relationships: { contact: { type: 'organizations', id: '1' } },
      }),
    ).toEqual([
      ['enum', 'relationships/contact/type', '["contacts"]'],
      ['format', 'relationships/contact/id', 'uuid'],
    ]);
  });

  it('run a CHECK spanning a field and a relationship once both are present', () => {
    expect(write({ notes: null }, { contact: null })).toEqual([
      ['MEETING_NEEDS_CONTACT_OR_NOTES', 'relationships/contact'],
      ['MEETING_NEEDS_CONTACT_OR_NOTES', 'attributes/notes'],
    ]);
    expect(
      write({ notes: null }, { contact: { type: 'contacts', id: CONTACT_ID } }),
    ).toEqual([]);
    expect(write({ notes: 'Agenda' }, { contact: null })).toEqual([]);
    // With the relationship left out, the database decides (SPEC 9.5).
    expect(write({ notes: null }, {})).toEqual([]);
  });

  it('take the attributes and relationships members as jsonapi-core parses them, both present', () => {
    expect(
      issuesOf(Meetings.write.create, {
        attributes: { room: 'lobby', during: DURING, notes: 'Agenda' },
        relationships: {},
      }),
    ).toEqual([]);
    expect(issuesOf(Meetings.write.update, { attributes: {} })).toEqual([
      ['required', 'relationships'],
    ]);
  });
});

describe('types from the emitted declarations (SPEC 6.2)', () => {
  it('narrow enums and CHECK enums, and type linkages by their target', () => {
    type Contact = Infer<typeof Contacts>;
    expectTypeOf<Contact['create']['kind']>().toEqualTypeOf<
      'person' | 'company' | undefined
    >();
    expectTypeOf<Contact['create']['status']>().toEqualTypeOf<
      'active' | 'archived' | undefined
    >();
    expectTypeOf<Contact['create']['name']>().toEqualTypeOf<string>();
    expectTypeOf<Contact['read']['priority']>().toEqualTypeOf<number | null>();
    expectTypeOf<
      Infer<typeof Meetings>['linkage']['create']['contact']
    >().toEqualTypeOf<{ type: 'contacts'; id: string } | null | undefined>();
  });
});

describe('boundary fixtures of the testing entry (SPEC 15.3)', () => {
  it('cover every field with a wire form and every relationship', () => {
    const contacts = boundaryFixtures(Contacts);
    expect(Object.keys(contacts.fields)).toEqual(
      Object.keys(Contacts.schema.read.shape),
    );
    expect(Object.keys(contacts.relationships)).toEqual(['organization']);
    // during carries a codec, whose own fixtures cover it.
    expect(Object.keys(boundaryFixtures(Meetings).fields)).toEqual([
      'room',
      'notes',
    ]);
  });

  it('probe the bounds the catalog sets', () => {
    expect(labels('priority')).toEqual(
      expect.arrayContaining([
        'upper bound 5',
        'upper bound 5, plus one',
        'lower bound 1',
        'int2 maximum, plus one',
      ]),
    );
    expect(labels('name')).toEqual(
      expect.arrayContaining(['maxLength 200', 'maxLength 200, plus one']),
    );
    expect(labels('createdAt')).toEqual(
      expect.arrayContaining(['fraction digits 6', 'past the largest offset']),
    );
  });
});
