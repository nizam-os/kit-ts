/**
 * The runtime twins of `fails/definitions.ts` (resource SPEC 11.2, 14),
 * through the built package: JavaScript callers get a `TypeError` naming
 * the option for each declaration whose derived keyset or JSON:API
 * resource `@nizam-os/keyset-core` or `@nizam-os/jsonapi-core` would refuse.
 */
import { describe, expect, it } from 'vitest';

import { Organizations } from './resources/organizations.ts';
import { declareUntyped, typeErrorOf } from './support/untyped.ts';

const FIELD_NAMES =
  "@nizam-os/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)";

const list = (members: object): object => ({
  operations: ['list'],
  fields: {},
  ...members,
});

const DEFINITION_ERRORS: ReadonlyArray<readonly [object, string]> = [
  [
    list({ fields: { name: { access: 'read', filter: [] } } }),
    'contacts.fields.name.filter: list at least one operator',
  ],
  [
    list({
      fields: { nickname: { access: 'read', filter: ['eq', 'in', 'eq'] } },
    }),
    'contacts.fields.nickname.filter[2]: "eq" is listed twice',
  ],
  [
    list({
      relationships: {
        organization_id: {
          target: () => Organizations,
          access: 'read',
          filter: ['in', 'in'],
        },
      },
    }),
    'contacts.relationships.organization_id.filter[1]: "in" is listed twice',
  ],
  [
    list({ fields: { name: { access: 'read', as: 'größe', filter: ['eq'] } } }),
    `contacts.fields.name.filter: public name "größe" is outside ${FIELD_NAMES}`,
  ],
  [
    list({
      fields: { nickname: { access: 'read', as: 'nick name', sort: true } },
    }),
    `contacts.fields.nickname.sort: public name "nick name" is outside ${FIELD_NAMES}`,
  ],
  [
    list({ fields: { email: { access: 'read', as: 'or', filter: ['eqi'] } } }),
    'contacts.fields.email.filter: public name "or" is the filter disjunction, filter[or]',
  ],
  [
    list({
      fields: { kind: { access: 'read', as: 'q', filter: ['eq'] } },
      search: { column: 'search' },
    }),
    'contacts.fields.kind.filter: public name "q" is the search parameter, filter[q]',
  ],
  [
    list({
      fields: { name: { access: 'read', sort: true } },
      sort: { default: ['-name', 'name'] },
    }),
    'contacts.sort.default[1]: "name" is listed twice',
  ],
];

describe('declarations whose derived definitions would not define', () => {
  it.each(DEFINITION_ERRORS)('%j', (declaration, message) => {
    expect(typeErrorOf(() => declareUntyped('contacts', declaration))).toBe(
      message,
    );
  });

  it('accepts the same names where nothing filters or sorts by them', () => {
    expect(() =>
      declareUntyped(
        'contacts',
        list({
          fields: {
            name: { access: 'read', as: 'größe' },
            email: { access: 'read', as: 'or', sort: true },
            kind: { access: 'read', as: 'q', filter: ['eq'] },
          },
        }),
      ),
    ).not.toThrow();
  });
});
