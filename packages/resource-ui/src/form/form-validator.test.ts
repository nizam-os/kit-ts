import { describe, expect, it } from 'vitest';

import { defaultMessages } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { Contacts, Organizations, RESOURCES } from '../test-support/resources';
import { resourceForm } from './resource-form';

const CONTACT = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  name: 'Ada Lovelace',
  nickname: null,
  email: null,
  status: 'active',
  priority: 2,
  discount: '0',
  lifetimeValue: null,
  score: null,
  tags: [],
  ratings: null,
  channels: [],
  vip: false,
  birthday: null,
  followUpAt: null,
  details: null,
  organization: { type: 'organizations', id: '7' },
  referredBy: null,
};

const ORGANIZATION = {
  type: 'organizations',
  id: '7',
  name: 'Analytical Engines',
  verified: true,
  marketingOptIn: false,
  openDays: [],
  foundedOn: null,
  plan: { type: 'plans', id: 'team' },
};

const edit = resourceForm(Contacts, 'update', { messages, record: CONTACT });

/** The issues the validator reports for the record's values with `changes`. */
function issuesOf(changes: Record<string, unknown>) {
  const result = edit.validator['~standard'].validate({
    ...edit.defaultValues,
    ...changes,
  });
  return 'issues' in result ? result.issues : [];
}

describe('the validator (resource SPEC 20.3, Standard Schema V1)', () => {
  it('is a synchronous Standard Schema of vendor nizam, frozen', () => {
    const standard = edit.validator['~standard'];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe('nizam');
    expect(Object.isFrozen(edit.validator)).toBe(true);
    expect(Object.isFrozen(standard)).toBe(true);
    expect(standard.validate(edit.defaultValues)).not.toBeInstanceOf(Promise);
  });

  it('outputs accepted values as they came in, the same object', () => {
    const values = { ...edit.defaultValues, priority: '5' };
    expect(edit.validator['~standard'].validate(values)).toEqual({
      value: values,
    });
    const result = edit.validator['~standard'].validate(values);
    expect('value' in result && result.value).toBe(values);
  });

  it.each([
    ['type', { score: '1e999' }, 'score', 'Erwartet: number.'],
    [
      'type of an integer',
      { priority: '1.5' },
      'priority',
      'Erwartet: integer.',
    ],
    [
      'format',
      { birthday: '1815-13-45' },
      'birthday',
      'Kein gültiges Format: date.',
    ],
    [
      'format of a local date-time',
      { followUpAt: '2026-10-12T09:30' },
      'followUpAt',
      'Kein gültiges Format: date-time-local.',
    ],
    [
      'format of an int64',
      { lifetimeValue: '1.5' },
      'lifetimeValue',
      'Kein gültiges Format: int64.',
    ],
    ['maxLength', { name: 'x'.repeat(201) }, 'name', 'Höchstens 200 Zeichen.'],
    ['minimum', { priority: '0' }, 'priority', 'Mindestens 1.'],
    ['maximum', { priority: '9' }, 'priority', 'Höchstens 5.'],
    ['exclusiveMinimum', { score: '0' }, 'score', 'Größer als 0.'],
    ['exclusiveMaximum', { score: '100' }, 'score', 'Kleiner als 100.'],
    [
      'multipleOf',
      { discount: '1.005' },
      'discount',
      'Ein Vielfaches von 0.01.',
    ],
    [
      'enum, with the option labels',
      { status: 'deleted' },
      'status',
      'Eines von: Aktiv, Archiviert.',
    ],
    ['pattern', { email: 'ada' }, 'email', 'Hat nicht die erwartete Form.'],
    [
      'type of an element',
      { ratings: ['4', 'x'] },
      'ratings',
      'Erwartet: integer.',
    ],
    [
      'enum of an element',
      { channels: ['fax'] },
      'channels',
      'Eines von: E-Mail, Telefon, Post.',
    ],
    [
      "format of a relationship's id",
      { organization: 'x' },
      'organization',
      'Kein gültiges Format: int64.',
    ],
    [
      "format of a self-relationship's id",
      { referredBy: 'nope' },
      'referredBy',
      'Kein gültiges Format: uuid.',
    ],
  ])(
    'places a %s issue on its member, worded as the server words it',
    (_, changes, name, message) => {
      expect(issuesOf(changes)).toEqual([{ message, path: [name] }]);
    },
  );

  it('keeps one issue per member, the first the write validator reported', () => {
    expect(
      Contacts.write.update['~standard']
        .validate({
          attributes: { discount: '1000.005' },
          relationships: {},
        })
        .issues?.map(({ code }) => code),
    ).toEqual(['multipleOf', 'maximum']);
    expect(issuesOf({ discount: '1000.005' })).toEqual([
      { message: 'Ein Vielfaches von 0.01.', path: ['discount'] },
    ]);
  });

  it('reports every member it refuses, in the order the write validator found them', () => {
    expect(
      issuesOf({ priority: '9', email: 'ada', referredBy: 'nope' }),
    ).toEqual([
      { message: 'Hat nicht die erwartete Form.', path: ['email'] },
      { message: 'Höchstens 5.', path: ['priority'] },
      { message: 'Kein gültiges Format: uuid.', path: ['referredBy'] },
    ]);
  });
});

describe('issues on no member the form holds (resource SPEC 20.3)', () => {
  it('gives the form an issue on a member it does not hold, such as a required one `members` left out', () => {
    const create = resourceForm(Contacts, 'create', {
      messages,
      members: ['name'],
    });
    expect(create.validator['~standard'].validate({ name: 'Ada' })).toEqual({
      issues: [{ message: 'Organisation fehlt.' }],
    });
  });

  it('keeps each distinct text of the form once', () => {
    const create = resourceForm(Organizations, 'create', {
      messages: defaultMessages(RESOURCES),
      members: ['inviteCode'],
    });
    expect(
      create.validator['~standard'].validate({ inviteCode: 'abc' }),
    ).toEqual({
      issues: [
        { message: 'A value is required.' },
        { message: 'Must be at least 6 characters.', path: ['inviteCode'] },
      ],
    });
  });
});

describe('a CHECK across members (resource SPEC 7.2, 20.3)', () => {
  const organizations = resourceForm(Organizations, 'update', {
    messages,
    record: ORGANIZATION,
  });

  it('puts the refusal on each of its members when the write carries them all', () => {
    expect(
      organizations.validator['~standard'].validate({
        ...organizations.defaultValues,
        plan: 'enterprise',
        verified: false,
      }),
    ).toEqual({
      issues: [
        { message: 'Verletzt die Regel über Tarif, Geprüft.', path: ['plan'] },
        {
          message: 'Verletzt die Regel über Tarif, Geprüft.',
          path: ['verified'],
        },
      ],
    });
  });

  it("leaves the rule to the server when the write carries only some of its members, since the others' values are the stored ones", () => {
    const unverified = resourceForm(Organizations, 'update', {
      messages,
      record: { ...ORGANIZATION, verified: false },
    });
    const values = { ...unverified.defaultValues, plan: 'enterprise' };
    expect(unverified.validator['~standard'].validate(values)).toEqual({
      value: values,
    });
    expect(unverified.write(values)).toEqual({
      relationships: { plan: { type: 'plans', id: 'enterprise' } },
    });
  });
});
