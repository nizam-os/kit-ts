import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@nizam-os/jsonapi-core';

import { KIND_DETAIL, KIND_STATUS } from '../errors/error-entry';
import {
  Contacts,
  declare,
  Meetings,
  Organizations,
} from '../test-support/registry';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';
import { localizeErrors } from './localize-errors';

const APP_ERRORS = {
  SEAT_LIMIT: {
    status: 402,
    title: 'Seat Limit',
    description: 'The plan has no seat left.',
  },
  OVERDUE: { status: 402 },
} as const;
const RESOURCES = [Organizations, Contacts, Meetings];
const english: any = defaultMessages(RESOURCES, APP_ERRORS);
const NO_FIELD = { field: '', fields: '' };

function texts(text: any): [string, string] {
  return [text.title(), text.detail(NO_FIELD)];
}

describe('defaultMessages (SPEC 10.2)', () => {
  it('is complete: defineMessages and localizeErrors take it as it stands', () => {
    expect(() => defineMessages(RESOURCES, APP_ERRORS, english)).not.toThrow();
    expect(() => localizeErrors(english)).not.toThrow();
  });

  it('has texts for exactly the codes no resource derives', () => {
    expect(Object.keys(english.errors)).toStrictEqual([
      ...ERROR_CODES,
      'QUOTA_EXCEEDED',
      'SEAT_LIMIT',
      'OVERDUE',
    ]);
  });

  it('gives catalog titles generic details, and an application code its description, or else its title', () => {
    expect(texts(english.errors.NOT_FOUND)).toStrictEqual([
      'Not Found',
      'The resource does not exist.',
    ]);
    expect(texts(english.errors.QUOTA_EXCEEDED)).toStrictEqual([
      'Quota Exceeded',
      'The quota for this operation is used up.',
    ]);
    expect(texts(english.errors.SEAT_LIMIT)).toStrictEqual([
      'Seat Limit',
      'The plan has no seat left.',
    ]);
    expect(texts(english.errors.OVERDUE)).toStrictEqual([
      'Payment Required',
      'Payment Required',
    ]);
  });

  it('gives each constraint kind the derived codes have the title and detail of SPEC 9.1', () => {
    const kinds = [
      'check',
      'notNull',
      'unique',
      'exclusion',
      'foreignKey',
    ] as const;
    expect(Object.keys(english.constraints)).toStrictEqual(kinds);
    for (const kind of kinds) {
      expect(texts(english.constraints[kind])).toStrictEqual([
        KIND_STATUS[kind].title,
        KIND_DETAIL[kind],
      ]);
    }
  });

  it('labels each member from its public name, and each option by its value', () => {
    const Kinds = declare('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { kind: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Organizations, access: 'read' },
      },
    });
    const kinds: any = defaultMessages([Organizations, Kinds]);
    expect(english.fields.contacts.organization()).toBe('Organization');
    expect(english.fields.meetings.attendees()).toBe('Attendees');
    expect(english.options).toStrictEqual({});
    expect(Object.keys(kinds.options.contacts.kind)).toStrictEqual([
      'person',
      'company',
    ]);
    expect(kinds.options.contacts.kind.company()).toBe('company');
  });

  it('runs the registry checks first', () => {
    expect(() => defaultMessages([Contacts])).toThrow(
      /^defaultMessages: relationship contacts\.organization targets organizations, which is not listed/u,
    );
  });
});
