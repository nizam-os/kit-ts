import type { ErrorItem } from '@nizam-os/ban-core';

import type { DerivedCode } from './message-index';

import { describe, expect, it } from 'vitest';

import { ISSUE_KINDS } from '../schema/issue-kinds';
import {
  Contacts,
  declare,
  Meetings,
  Organizations,
} from '../test-support/registry';
import { defaultMessages } from './default-messages';
import { checkedMessages, defineMessages } from './define-messages';
import { dictionaryOf } from './dictionary';
import {
  derivedType,
  fieldsFor,
  issueDetail,
  labelFor,
  memberAt,
  valuesFor,
} from './error-inputs';

function dictionary(messages: unknown): ReturnType<typeof dictionaryOf> {
  const checked = checkedMessages(messages);
  if (checked === undefined) {
    throw new Error('not checked');
  }
  return dictionaryOf(checked);
}

const Kinds = declare('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: { kind: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});
const KINDS = [Organizations, Kinds];
const kinds: any = defaultMessages(KINDS);
const german = dictionary(
  defineMessages(
    KINDS,
    {},
    {
      ...kinds,
      options: {
        contacts: { kind: { person: () => 'Person', company: () => 'Firma' } },
      },
    },
  ),
);
const english = dictionary(
  defaultMessages([Organizations, Contacts, Meetings]),
);

/** An item that points nowhere, such as one about a header. */
const NO_PATH: ErrorItem = { detail: 'x' };
/** The type of a request whose host names none. */
const UNNAMED = new Map<string, string>().get('contacts');

function derived(code: string): DerivedCode {
  const found = english.index.derived.get(code);
  if (found === undefined) {
    throw new Error(`${code} is not derived`);
  }
  return found;
}

describe('memberAt (SPEC 10.3)', () => {
  it('reads the member after data/attributes, data/relationships, or data/id', () => {
    expect(memberAt(['data', 'attributes', 'name'])).toBe('name');
    expect(memberAt(['data', 'attributes', 'tags', 3])).toBe('tags');
    expect(
      memberAt(['data', 'relationships', 'organization', 'data', 'id']),
    ).toBe('organization');
    expect(memberAt(['data', 'id'])).toBe('id');
  });

  it('reads it inside an Atomic Operations operation', () => {
    expect(
      memberAt(['atomic:operations', 2, 'data', 'attributes', 'room']),
    ).toBe('room');
    expect(
      memberAt(['atomic:operations', '2', 'data', 'relationships', 'contact']),
    ).toBe('contact');
    expect(memberAt(['atomic:operations', '02', 'data', 'id'])).toBeUndefined();
  });

  it('finds no member for any other path', () => {
    expect(memberAt(NO_PATH.path)).toBeUndefined();
    expect(memberAt([])).toBeUndefined();
    expect(memberAt(['filter', 'name'])).toBeUndefined();
    expect(memberAt(['meta', 'data', 'attributes', 'name'])).toBeUndefined();
    expect(memberAt(['data', 'type'])).toBeUndefined();
    expect(memberAt(['data', 'attributes'])).toBeUndefined();
    expect(memberAt(['data', 'attributes', 0])).toBeUndefined();
  });
});

describe('labelFor (SPEC 10.3)', () => {
  it("labels a member of the type, and names the id by JSON:API's member name", () => {
    expect(labelFor(english, 'contacts', 'name')).toBe('Name');
    expect(labelFor(english, 'contacts', 'organization')).toBe('Organization');
    expect(labelFor(english, 'contacts', 'id')).toBe('id');
    expect(labelFor(english, undefined, 'id')).toBe('id');
  });

  it('gives no label for a member the type does not have, or without a type', () => {
    expect(labelFor(english, 'contacts', 'room')).toBe('');
    expect(labelFor(english, 'contacts', '__proto__')).toBe('');
    expect(labelFor(english, 'contacts', 'constructor')).toBe('');
    expect(labelFor(english, 'ghosts', 'name')).toBe('');
    expect(labelFor(english, undefined, 'name')).toBe('');
    expect(labelFor(english, 'contacts', memberAt(['filter']))).toBe('');
  });
});

describe('derivedType and fieldsFor (SPEC 10.3)', () => {
  it('labels a code two types derive in the request type, else in the first', () => {
    const email = derived('EMAIL_CHECK');
    expect([...email.types.keys()]).toStrictEqual(['contacts', 'meetings']);
    expect(derivedType(email, 'meetings')).toBe('meetings');
    expect(derivedType(email, 'organizations')).toBe('contacts');
    expect(derivedType(email, UNNAMED)).toBe('contacts');
    expect(fieldsFor(english, email, 'meetings')).toBe('Attendees');
    expect(fieldsFor(english, email, 'contacts')).toBe('Email');
    expect(fieldsFor(english, email, UNNAMED)).toBe('');
  });
});

describe('valuesFor (SPEC 10.3)', () => {
  it("labels each option an enum issue lists, by the field's labels", () => {
    expect(valuesFor(german, 'contacts', 'kind', '["person","company"]')).toBe(
      'Person, Firma',
    );
    expect(valuesFor(german, 'contacts', 'kind', '["person","robot"]')).toBe(
      'Person, robot',
    );
    expect(valuesFor(german, undefined, 'kind', '["person"]')).toBe('person');
    expect(valuesFor(german, 'contacts', 'kind', '[]')).toBe('');
  });

  it('keeps an expected value that is not a JSON array as it is', () => {
    expect(valuesFor(german, 'contacts', 'kind', '^https://')).toBe(
      '^https://',
    );
    expect(valuesFor(german, 'contacts', 'kind', '"person"')).toBe('"person"');
  });
});

describe('issueDetail (SPEC 10.3)', () => {
  // Each message echoes its kind and the inputs it received.
  const echo = dictionary(
    defineMessages(
      KINDS,
      {},
      {
        ...kinds,
        validation: Object.fromEntries(
          ISSUE_KINDS.map((kind) => [
            kind,
            (inputs: object) => `${kind} ${JSON.stringify(inputs)}`,
          ]),
        ),
      },
    ),
  );
  const facts = { field: 'Art', expected: '5', values: () => 'Person, Firma' };

  const cases = [
    ['required', { field: 'Art' }],
    ['type', { field: 'Art', type: '5' }],
    ['format', { field: 'Art', format: '5' }],
    ['minLength', { field: 'Art', limit: '5' }],
    ['maxLength', { field: 'Art', limit: '5' }],
    ['minimum', { field: 'Art', limit: '5' }],
    ['maximum', { field: 'Art', limit: '5' }],
    ['exclusiveMinimum', { field: 'Art', limit: '5' }],
    ['exclusiveMaximum', { field: 'Art', limit: '5' }],
    ['multipleOf', { field: 'Art', limit: '5' }],
    ['enum', { field: 'Art', values: 'Person, Firma' }],
    ['pattern', { field: 'Art' }],
    ['additionalProperties', { field: 'Art' }],
  ] as const;

  it.each(cases)('gives %s exactly the inputs of its kind', (kind, inputs) => {
    expect(issueDetail(echo, kind, facts)).toBe(
      `${kind} ${JSON.stringify(inputs)}`,
    );
  });

  it('has a case for every issue kind', () => {
    expect(cases.map(([kind]) => kind).toSorted()).toStrictEqual(
      [...ISSUE_KINDS].toSorted(),
    );
  });
});
