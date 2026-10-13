import type { DeclaredResource } from '@nizam-os/resource-core';

import type { FormOperation, FormRecord } from './form-types';

import { describe, expect, it } from 'vitest';

import { descriptorsOf } from '../fields/fields-of';
import { messages } from '../test-support/messages';
import { Contacts, Organizations } from '../test-support/resources';
import { heldDescriptors } from './form-options';
import { heldMember } from './form-values';
import { writeOf } from './form-write';
import { resourceForm } from './resource-form';

const RECORD = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  name: 'Ada Lovelace',
  nickname: 'Countess',
  email: null,
  status: 'active',
  priority: 2,
  discount: '0',
  lifetimeValue: null,
  score: null,
  tags: ['math'],
  ratings: null,
  channels: [],
  vip: false,
  birthday: null,
  followUpAt: null,
  details: { a: 1 },
  organization: { type: 'organizations', id: '7' },
  referredBy: { type: 'contacts', id: '5d3e0e9a-6f43-4b8e-a3a5-0d6f1f3b9a22' },
};

const create = resourceForm(Contacts, 'create', { messages });
const edit = resourceForm(Contacts, 'update', { messages, record: RECORD });

/** The write `values` make before the validator runs: what step 4 refuses is visible here. */
function unvalidated(
  resource: DeclaredResource,
  operation: FormOperation,
  values: Record<string, unknown>,
  record?: FormRecord,
) {
  const members = heldDescriptors(
    resource.names.type,
    operation,
    descriptorsOf('test', resource, messages),
  ).map((descriptor) => heldMember(descriptor, operation, record));
  return writeOf(operation, members, values);
}

describe('the write: which members (resource SPEC 20.3, step 1)', () => {
  it('carries on create the members that changed and the required ones, and nothing the person left alone', () => {
    expect(
      create.write({
        ...create.defaultValues,
        name: 'Ada',
        tags: ['math'],
        organization: '7',
      }),
    ).toEqual({
      attributes: { name: 'Ada', tags: ['math'] },
      relationships: { organization: { type: 'organizations', id: '7' } },
    });
  });

  it('carries on update only what changed, so the stored value of every other member stays', () => {
    expect(
      edit.write({ ...edit.defaultValues, nickname: 'Enchantress' }),
    ).toEqual({ attributes: { nickname: 'Enchantress' } });
    expect(edit.write(edit.defaultValues)).toEqual({});
  });

  it('compares arrays element by element and JSON values by identity', () => {
    expect(
      edit.write({
        ...edit.defaultValues,
        tags: ['math'],
        details: edit.defaultValues['details'],
      }),
    ).toEqual({});
    expect(edit.write({ ...edit.defaultValues, details: { a: 1 } })).toEqual({
      attributes: { details: { a: 1 } },
    });
    expect(
      edit.write({ ...edit.defaultValues, tags: ['math', 'engines'] }),
    ).toEqual({ attributes: { tags: ['math', 'engines'] } });
  });

  it('counts a member the values leave out as left alone', () => {
    expect(edit.write({ nickname: 'Enchantress' })).toEqual({
      attributes: { nickname: 'Enchantress' },
    });
    expect(unvalidated(Contacts, 'create', {})).toEqual({
      attributes: { name: null },
      relationships: { organization: null },
    });
  });
});

describe('the write: wire forms (resource SPEC 20.3, step 2, ADR 0016)', () => {
  it('sends a cleared input as null, which a nullable member takes', () => {
    expect(
      edit.write({
        ...edit.defaultValues,
        nickname: '',
        priority: '',
        details: undefined,
        referredBy: '',
      }),
    ).toEqual({
      attributes: { nickname: null, priority: null, details: null },
      relationships: { referredBy: null },
    });
  });

  it('sends a blank as null for a member that is not nullable too, which the validator refuses', () => {
    expect(
      unvalidated(
        Contacts,
        'update',
        { name: '', vip: null, organization: '' },
        RECORD,
      ),
    ).toEqual({
      attributes: { name: null, vip: null },
      relationships: { organization: null },
    });
    expect(() => edit.write({ ...edit.defaultValues, vip: null })).toThrow(
      new TypeError(
        "resourceForm.write: the values do not pass the form's validator",
      ),
    );
  });

  it("turns a number input's text into the number when it is a finite JSON number", () => {
    const write = edit.write({
      ...edit.defaultValues,
      priority: '5',
      score: '1.5e1',
    });
    expect(write).toEqual({ attributes: { priority: 5, score: 15 } });
    expect(
      create.write({
        ...create.defaultValues,
        name: 'Ada',
        organization: '7',
        score: '99.5',
      }).attributes,
    ).toEqual({ name: 'Ada', score: 99.5 });
  });

  it.each([
    '1e999',
    '-1e999',
    '0x10',
    '01',
    '.5',
    '3.',
    ' 3',
    '3 ',
    '+3',
    'NaN',
    'Infinity',
    '1_000',
  ])(
    'keeps the number text %j as text, which the validator refuses with type',
    (text) => {
      expect(unvalidated(Contacts, 'update', { score: text }, RECORD)).toEqual({
        attributes: { score: text },
      });
    },
  );

  it('sends the text of a string wire as typed: a decimal and an int64 stay exact', () => {
    expect(
      edit.write({
        ...edit.defaultValues,
        discount: '12.50',
        lifetimeValue: '9007199254740993',
        nickname: ' Countess ',
      }),
    ).toEqual({
      attributes: {
        discount: '12.50',
        lifetimeValue: '9007199254740993',
        nickname: ' Countess ',
      },
    });
  });

  it("converts an array's elements by its items: numbers and booleans from their texts", () => {
    expect(
      edit.write({ ...edit.defaultValues, ratings: ['4', '5'], tags: [] }),
    ).toEqual({ attributes: { ratings: [4, 5], tags: [] } });
    expect(
      unvalidated(Contacts, 'update', { ratings: ['4', 'x', ''] }, RECORD),
    ).toEqual({ attributes: { ratings: [4, 'x', ''] } });
    expect(
      unvalidated(Organizations, 'create', {
        openDays: ['true', 'false', 'yes'],
      }).attributes,
    ).toEqual({
      name: null,
      marketingOptIn: null,
      openDays: [true, false, 'yes'],
    });
  });

  it("sends a relationship's id as the identifier of its target", () => {
    const organizations = resourceForm(Organizations, 'create', { messages });
    expect(
      organizations.write({
        ...organizations.defaultValues,
        name: 'Analytical Engines',
        marketingOptIn: false,
        plan: 'team',
      }),
    ).toEqual({
      attributes: { name: 'Analytical Engines', marketingOptIn: false },
      relationships: { plan: { type: 'plans', id: 'team' } },
    });
  });
});

describe('the write: parts and refusal (resource SPEC 20.3, steps 3 and 4)', () => {
  it('holds each part only when it holds a member', () => {
    expect(edit.write({ organization: '8' })).toEqual({
      relationships: { organization: { type: 'organizations', id: '8' } },
    });
    expect(Object.keys(edit.write({ status: 'archived' }))).toEqual([
      'attributes',
    ]);
  });

  it('throws for values the validator refuses, since a submit handler only receives accepted ones', () => {
    expect(() => create.write(create.defaultValues)).toThrow(
      new TypeError(
        "resourceForm.write: the values do not pass the form's validator",
      ),
    );
    expect(() => edit.write({ ...edit.defaultValues, priority: '9' })).toThrow(
      TypeError,
    );
  });

  it('returns what the person entered, not what the validator outputs', () => {
    const write = edit.write({ ...edit.defaultValues, discount: '1.5' });
    expect(write).toEqual({ attributes: { discount: '1.5' } });
  });
});
