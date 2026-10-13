import { describe, expect, it } from 'vitest';

import { defaultMessages } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import {
  Contacts,
  Organizations,
  Plans,
  RESOURCES,
} from '../test-support/resources';
import { resourceForm } from './resource-form';

/** A JavaScript caller's arguments, which the types would refuse. */
const untyped = resourceForm as (...args: Array<any>) => unknown;

const RECORD = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  name: 'Ada Lovelace',
};

describe('resourceForm: the model (resource SPEC 20.3)', () => {
  it('names its type and operation', () => {
    const create = resourceForm(Contacts, 'create', { messages });
    expect([create.type, create.operation]).toEqual(['contacts', 'create']);
    const edit = resourceForm(Organizations, 'update', {
      messages,
      record: { type: 'organizations', id: '7', name: 'Analytical Engines' },
      members: ['name'],
    });
    expect([edit.type, edit.operation]).toEqual(['organizations', 'update']);
  });

  it('labels every member with the messages it was given', () => {
    const english = resourceForm(Contacts, 'create', {
      messages: defaultMessages(RESOURCES),
    });
    expect(english.fields.map(({ label }) => label()).slice(0, 3)).toEqual([
      'Kind',
      'Name',
      'Nickname',
    ]);
  });
});

describe('resourceForm: the TypeErrors of a JavaScript caller (resource SPEC 20.1, 20.3)', () => {
  it.each([
    ['an object no declareResource returned', {}],
    ['undefined', undefined],
    ['its fields alone', { fields: Contacts.fields }],
  ])('refuses %s as the resource', (_, resource) => {
    expect(() => untyped(resource, 'create', { messages })).toThrow(
      new TypeError(
        'resourceForm: resource must be what a declareResource returned',
      ),
    );
  });

  it.each(['remove', 'list', 'Create', undefined])(
    'refuses %j as the operation',
    (operation) => {
      expect(() => untyped(Contacts, operation, { messages })).toThrow(
        new TypeError('resourceForm: operation must be create or update'),
      );
    },
  );

  it('refuses an operation the resource does not serve', () => {
    expect(() => untyped(Plans, 'create', { messages })).toThrow(
      new TypeError('resourceForm: plans does not serve create'),
    );
    expect(() =>
      untyped(Plans, 'update', { messages, record: { id: 'free' } }),
    ).toThrow(new TypeError('resourceForm: plans does not serve update'));
  });

  it.each([undefined, null, 'messages', [messages]])(
    'refuses %j as the options',
    (options) => {
      expect(() => untyped(Contacts, 'create', options)).toThrow(
        new TypeError('resourceForm: options must be an object'),
      );
    },
  );

  it('refuses a key that is no option, naming the key', () => {
    expect(() =>
      untyped(Contacts, 'create', { messages, defaults: { name: 'Ada' } }),
    ).toThrow(new TypeError('resourceForm: options.defaults is not an option'));
  });

  it('refuses a record on create, which starts from the defaults', () => {
    expect(() =>
      untyped(Contacts, 'create', { messages, record: RECORD }),
    ).toThrow(
      new TypeError(
        'resourceForm: options.record is for update; a create starts from the defaults',
      ),
    );
  });

  it.each([undefined, null, [RECORD], 'record'])(
    'refuses %j as the record of an update',
    (record) => {
      expect(() => untyped(Contacts, 'update', { messages, record })).toThrow(
        new TypeError(
          'resourceForm: options.record must be the record an update edits',
        ),
      );
    },
  );

  it.each([
    ['a name', 'name'],
    ['a list holding a number', ['name', 1]],
    ['null', null],
  ])('refuses %s as the members', (_, members) => {
    expect(() => untyped(Contacts, 'create', { messages, members })).toThrow(
      new TypeError(
        'resourceForm: options.members must be a list of public names',
      ),
    );
  });

  it.each([
    ['create', 'createdAt'],
    ['create', 'organization_id'],
    ['update', 'kind'],
    ['update', 'search'],
  ])('refuses a member the %s does not write, naming it', (operation, name) => {
    const record = operation === 'update' ? RECORD : undefined;
    expect(() =>
      untyped(Contacts, operation, { messages, record, members: [name] }),
    ).toThrow(
      new TypeError(
        `resourceForm: options.members names ${name}, which the ${operation} of contacts does not write`,
      ),
    );
  });

  it('refuses a member named twice', () => {
    expect(() =>
      untyped(Contacts, 'create', { messages, members: ['name', 'name'] }),
    ).toThrow(new TypeError('resourceForm: options.members names name twice'));
  });

  it('refuses messages no definer returned, and messages of another declaration of the type', () => {
    expect(() =>
      untyped(Contacts, 'create', { messages: { ...messages } }),
    ).toThrow(
      new TypeError(
        'resourceForm: messages must be what defineMessages or defaultMessages returned',
      ),
    );
    expect(() =>
      untyped(Contacts, 'create', { messages: defaultMessages([Plans]) }),
    ).toThrow(
      new TypeError('resourceForm: the messages label no member of contacts'),
    );
  });

  it('checks the resource, then the operation, then the options', () => {
    expect(() => untyped({}, 'remove')).toThrow(
      'resourceForm: resource must be',
    );
    expect(() => untyped(Contacts, 'remove')).toThrow(
      'resourceForm: operation must be',
    );
  });
});
