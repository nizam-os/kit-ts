import type { FieldDefault } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { descriptorsOf } from '../fields/fields-of';
import { messages } from '../test-support/messages';
import { Contacts, Organizations } from '../test-support/resources';
import { heldMember } from './form-values';
import { resourceForm } from './resource-form';

/** A contact as the client reads it (jsonapi SPEC 15.6), its organization as linkage. */
const CONTACT = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  kind: 'company',
  name: 'Ada Lovelace',
  nickname: null,
  email: 'ada@example.com',
  status: 'archived',
  priority: 2,
  discount: '12.50',
  lifetimeValue: '9007199254740993',
  score: 1.5,
  tags: ['math', 'engines'],
  ratings: [4, 5],
  channels: ['email', 'post'],
  vip: true,
  birthday: '1815-12-10',
  followUpAt: '2026-10-12T09:30:00',
  details: { notes: ['first programmer'] },
  createdAt: '2026-10-01T08:00:00Z',
  organization: { type: 'organizations', id: '7' },
  referredBy: null,
};

/** An organization as the client reads it, with no invite code: a write-only member is never read. */
const ORGANIZATION = {
  type: 'organizations',
  id: '7',
  name: 'Analytical Engines',
  verified: false,
  marketingOptIn: null,
  openDays: [true, false],
  foundedOn: null,
  createdAt: '2026-10-01T08:00:00Z',
  plan: { type: 'plans', id: 'team' },
};

function editContact(record: Record<string, unknown>) {
  return resourceForm(Contacts, 'update', { messages, record });
}

/** Where a create starts the contact member `name` when its column's default is `fieldDefault`. */
function startWith(name: string, fieldDefault: FieldDefault) {
  const descriptor = descriptorsOf('test', Contacts, messages).find(
    (described) => described.name === name,
  );
  if (descriptor === undefined) {
    throw new Error(`no ${name}`);
  }
  const meta = { ...descriptor.meta, default: fieldDefault };
  return heldMember({ ...descriptor, meta }, 'create').start;
}

describe('start values on create (resource SPEC 20.3)', () => {
  const contacts = resourceForm(Contacts, 'create', { messages });
  const organizations = resourceForm(Organizations, 'create', { messages });

  it('holds every member a create writes, in declaration order, each required as the create requires it', () => {
    expect(
      contacts.fields.map(({ name, required }) => [name, required]),
    ).toEqual([
      ['kind', false],
      ['name', true],
      ['nickname', false],
      ['email', false],
      ['status', false],
      ['priority', false],
      ['discount', false],
      ['lifetimeValue', false],
      ['score', false],
      ['tags', false],
      ['ratings', false],
      ['channels', false],
      ['vip', false],
      ['birthday', false],
      ['followUpAt', false],
      ['details', false],
      ['organization', true],
      ['referredBy', false],
    ]);
    expect(
      organizations.fields.map(({ name, required }) => [name, required]),
    ).toEqual([
      ['name', true],
      ['verified', false],
      ['marketingOptIn', true],
      ['openDays', false],
      ['foundedOn', false],
      ['inviteCode', false],
      ['plan', false],
    ]);
  });

  it("starts each member from its default as a read gives it, read as an update reads the record's value, and every other member blank", () => {
    expect(contacts.defaultValues).toEqual({
      kind: 'person',
      name: '',
      nickname: '',
      email: '',
      status: 'active',
      priority: '',
      discount: '0',
      lifetimeValue: '',
      score: '',
      tags: [],
      ratings: [],
      channels: [],
      vip: false,
      birthday: '',
      followUpAt: '',
      details: undefined,
      organization: '',
      referredBy: '',
    });
    expect(Object.hasOwn(contacts.defaultValues, 'details')).toBe(true);
    expect(organizations.defaultValues).toEqual({
      name: '',
      verified: false,
      marketingOptIn: null,
      openDays: ['true', 'true', 'true', 'true', 'true', 'false', 'false'],
      foundedOn: '',
      inviteCode: '',
      plan: 'free',
    });
    expect(Object.isFrozen(organizations.defaultValues['openDays'])).toBe(true);
  });

  it("starts a JSON member from its default's value, the same object", () => {
    const value = Object.freeze({ theme: 'light' });
    expect(startWith('details', { literal: '{"theme": "light"}', value })).toBe(
      value,
    );
  });

  it('starts blank from a default with no read form, such as an expression', () => {
    expect(startWith('tags', { literal: null, value: undefined })).toEqual([]);
    expect(startWith('name', { literal: null, value: undefined })).toBe('');
    expect(
      startWith('details', { literal: 'null', value: undefined }),
    ).toBeUndefined();
  });

  it('describes the members with the descriptors of fieldsOf, only required changed', () => {
    const [kind] = contacts.fields;
    expect(kind?.label()).toBe('Art');
    expect(kind?.options?.map(({ value }) => value)).toEqual([
      'person',
      'company',
    ]);
    expect(kind?.meta).toBe(Contacts.fields['kind']);
  });

  it('is frozen, its arrays and descriptors included', () => {
    expect(Object.isFrozen(contacts.defaultValues)).toBe(true);
    expect(Object.isFrozen(contacts.defaultValues['tags'])).toBe(true);
    expect(Object.isFrozen(contacts.fields)).toBe(true);
    expect(contacts.fields.every((field) => Object.isFrozen(field))).toBe(true);
    expect(Object.isFrozen(contacts)).toBe(true);
  });
});

describe('start values on update (resource SPEC 20.3)', () => {
  it('holds every member an update writes, none of them required', () => {
    const edit = editContact(CONTACT);
    expect(edit.fields.map(({ name }) => name)).not.toContain('kind');
    expect(edit.fields.every(({ required }) => !required)).toBe(true);
    expect(edit.fields).toHaveLength(17);
  });

  it("reads each member's value as its input edits it: strings as they are, numbers by String, null as blank", () => {
    expect(editContact(CONTACT).defaultValues).toEqual({
      name: 'Ada Lovelace',
      nickname: '',
      email: 'ada@example.com',
      status: 'archived',
      priority: '2',
      discount: '12.50',
      lifetimeValue: '9007199254740993',
      score: '1.5',
      tags: ['math', 'engines'],
      ratings: ['4', '5'],
      channels: ['email', 'post'],
      vip: true,
      birthday: '1815-12-10',
      followUpAt: '2026-10-12T09:30:00',
      details: { notes: ['first programmer'] },
      organization: '7',
      referredBy: '',
    });
  });

  it('keeps a JSON value as it is, the same object, and reads a boolean array element by element', () => {
    expect(editContact(CONTACT).defaultValues['details']).toBe(CONTACT.details);
    const edit = resourceForm(Organizations, 'update', {
      messages,
      record: ORGANIZATION,
    });
    expect(edit.defaultValues).toEqual({
      name: 'Analytical Engines',
      verified: false,
      marketingOptIn: null,
      openDays: ['true', 'false'],
      foundedOn: '',
      inviteCode: '',
      plan: 'team',
    });
    expect(Object.isFrozen(edit.defaultValues['openDays'])).toBe(true);
  });

  it("reads a relationship from its included record's id, and an empty array and a null one as []", () => {
    const included = {
      ...CONTACT,
      organization: { type: 'organizations', id: '9', name: 'Difference Inc.' },
      tags: [],
      ratings: null,
    };
    const { defaultValues } = editContact(included);
    expect(defaultValues['organization']).toBe('9');
    expect(defaultValues['tags']).toEqual([]);
    expect(defaultValues['ratings']).toEqual([]);
  });

  it('starts a write-only member blank, since no read returns it', () => {
    const edit = resourceForm(Organizations, 'update', {
      messages,
      record: { ...ORGANIZATION, inviteCode: 'from-a-stale-cache' },
    });
    expect(edit.defaultValues['inviteCode']).toBe('');
  });

  it('holds what `members` names, in declaration order, so the record needs only those', () => {
    const edit = resourceForm(Contacts, 'update', {
      messages,
      record: { type: 'contacts', id: '1', status: 'active', name: 'Ada' },
      members: ['status', 'name'],
    });
    expect(edit.fields.map(({ name }) => name)).toEqual(['name', 'status']);
    expect(edit.defaultValues).toEqual({ name: 'Ada', status: 'active' });
  });

  it('throws for a record that lacks a member the form holds, naming the member', () => {
    const { nickname: _, ...sparse } = CONTACT;
    expect(() => editContact(sparse)).toThrow(
      new TypeError(
        'resourceForm: the record has no nickname, which the form holds',
      ),
    );
    expect(() => editContact({ ...CONTACT, organization: undefined })).toThrow(
      new TypeError(
        'resourceForm: the record has no organization, which the form holds',
      ),
    );
  });

  it.each([
    ['name', { first: 'Ada' }],
    ['priority', [2]],
    ['vip', 'yes'],
    ['tags', 'math'],
    ['tags', [{ tag: 'math' }]],
    ['ratings', [4, null]],
  ])(
    'throws for a record whose %s is not the value its type reads, naming the member and not the value',
    (name, value) => {
      expect(() => editContact({ ...CONTACT, [name]: value })).toThrow(
        new TypeError(
          `resourceForm: the record's ${name} is not the value its type reads`,
        ),
      );
    },
  );

  it.each([
    ['an id', '7'],
    ['an identifier without an id', { type: 'organizations' }],
    ['an identifier with a numeric id', { type: 'organizations', id: 7 }],
    ['a to-many linkage', [{ type: 'organizations', id: '7' }]],
  ])('throws for a relationship that is %s', (_, value) => {
    expect(() => editContact({ ...CONTACT, organization: value })).toThrow(
      new TypeError(
        "resourceForm: the record's organization is neither linkage nor a record",
      ),
    );
  });
});
