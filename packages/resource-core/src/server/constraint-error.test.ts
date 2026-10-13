import type { Violation } from '../test-support/violations';

import { describe, expect, it } from 'vitest';

import { BanError, createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

import { errorCatalog } from '../errors/error-catalog';
import {
  DRIVERS,
  Owners,
  Things,
  VIOLATIONS,
} from '../test-support/violations';
import { constraintError } from './constraint-error';

const INVALID = { status: 422, title: 'Invalid Attribute' };
const CONFLICT = { status: 409, title: 'Conflict' };

/** What `constraintError` returned, as `toEqual` compares it. */
interface Summary {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly paths: ReadonlyArray<string | undefined> | undefined;
}

function summary(error: BanError | undefined): Summary | undefined {
  return error === undefined
    ? undefined
    : {
        status: error.status,
        code: error.code,
        title: error.title,
        detail: error.detail,
        paths: error.errors?.map(({ path }) => path?.join('/')),
      };
}

const CASES: ReadonlyArray<readonly [string, Violation, Summary]> = [
  [
    'a NOT NULL column by its NOT NULL key',
    VIOLATIONS.notNull,
    {
      ...INVALID,
      code: 'THINGS_NAME_NOT_NULL',
      detail: 'A value is required.',
      paths: ['data/attributes/name'],
    },
  ],
  [
    'a UNIQUE constraint',
    VIOLATIONS.unique,
    {
      ...CONFLICT,
      code: 'THINGS_CODE_KEY',
      detail: 'Another record already has this value.',
      paths: ['data/attributes/code'],
    },
  ],
  [
    'a table CHECK',
    VIOLATIONS.check,
    {
      ...INVALID,
      code: 'THINGS_QTY_CHECK',
      detail: 'The value violates a constraint.',
      paths: ['data/attributes/qty'],
    },
  ],
  [
    'an EXCLUDE constraint',
    VIOLATIONS.exclusion,
    {
      ...CONFLICT,
      code: 'THINGS_DURING_EXCL',
      detail: 'The value conflicts with another record.',
      paths: ['data/attributes/during'],
    },
  ],
  [
    'a FOREIGN KEY on a write, at the relationship',
    VIOLATIONS.foreignKey,
    {
      status: 404,
      title: 'Related Resource Not Found',
      code: 'THINGS_OWNER_ID_FKEY',
      detail: 'The related resource does not exist.',
      paths: ['data/relationships/owner'],
    },
  ],
  [
    'the PRIMARY KEY, at the id',
    VIOLATIONS.primaryKey,
    {
      ...CONFLICT,
      code: 'THINGS_PKEY',
      detail: 'A record with this id already exists.',
      paths: ['data/id'],
    },
  ],
  [
    "a domain's CHECK by its domain",
    VIOLATIONS.domainCheck,
    {
      ...INVALID,
      code: 'SHORT_CODE_CHECK',
      detail: 'The value violates a constraint.',
      paths: ['data/attributes/code'],
    },
  ],
];

describe.each(DRIVERS)(
  'constraintError over %s (SPEC 9.5)',
  (_driver, raise) => {
    it.each(CASES)('maps %s', (_name, violation, expected) => {
      const error = constraintError(raise(violation), {
        resource: Things,
        operation: 'create',
      });
      expect(summary(error)).toEqual(expected);
    });

    it.each([
      ['a reference that blocks it', VIOLATIONS.foreignKey],
      ['a reference ON DELETE RESTRICT on PostgreSQL 18', VIOLATIONS.restrict],
      ["a SET NULL that breaks the referencing row's CHECK", VIOLATIONS.check],
      [
        "a SET NULL that breaks the referencing row's NOT NULL",
        VIOLATIONS.notNull,
      ],
    ])(
      'answers CONFLICT for every integrity violation of a remove, whatever the table: %s',
      (_name, violation) => {
        for (const resource of [Owners, Things]) {
          const error = constraintError(raise(violation), {
            resource,
            operation: 'remove',
          });
          expect(summary(error)).toEqual({
            ...CONFLICT,
            code: 'CONFLICT',
            detail: 'The resource is still referenced.',
            paths: undefined,
          });
        }
      },
    );

    it('leaves to the ban what a remove raises outside the integrity class', () => {
      expect(
        constraintError(raise({ code: '40001', schema: 'public' }), {
          resource: Owners,
          operation: 'remove',
        }),
      ).toBeUndefined();
    });

    const own = (violation: Violation, resource = Things) =>
      constraintError(raise(violation), { resource, operation: 'update' });

    it('leaves to the ban what the resource declares no code for', () => {
      expect(own(VIOLATIONS.scopeNotNull)).toBeUndefined();
      expect(own(VIOLATIONS.foreignKey, Owners)).toBeUndefined();
      expect(own({ ...VIOLATIONS.unique, schema: 'other' })).toBeUndefined();
      expect(
        own({ ...VIOLATIONS.domainCheck, schema: 'other' }),
      ).toBeUndefined();
      expect(own({ ...VIOLATIONS.domainCheck, code: '23502' })).toBeUndefined();
      expect(own({ code: '40001', schema: 'public' })).toBeUndefined();
    });

    it('leaves to the ban a violation without the name its code is keyed by', () => {
      const { column: _column, ...notNull } = VIOLATIONS.notNull;
      const { constraint: _check, ...check } = VIOLATIONS.check;
      const { constraint: _domain, ...domainCheck } = VIOLATIONS.domainCheck;
      for (const violation of [notNull, check, domainCheck]) {
        expect(own(violation)).toBeUndefined();
      }
    });

    it('keeps a code only when its kind is the one the SQLSTATE reports', () => {
      const index = { ...VIOLATIONS.check, code: '23505' };
      expect(
        constraintError(raise(index), {
          resource: Things,
          operation: 'create',
        }),
      ).toBeUndefined();
    });

    it('keeps the driver error as the cause, never its wrapper', () => {
      const driverError = raise(VIOLATIONS.unique);
      const wrapper = new Error('Failed query: insert ...', {
        cause: driverError,
      });
      const error = constraintError(wrapper, {
        resource: Things,
        operation: 'create',
      });
      expect(error?.cause).toBe(driverError);
    });
  },
);

describe('constraintError through createBan', () => {
  it('renders the code with a pointer per member and no server text', () => {
    const ban = createBan({
      format: jsonApi({ includeId: false }),
      errors: errorCatalog([Owners, Things]),
    });
    const thrown = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "things_code_key"',
      ),
      {
        severity: 'ERROR',
        detail: 'Key (code)=(abc) already exists.',
        ...VIOLATIONS.unique,
      },
    );
    const error = constraintError(thrown, {
      resource: Things,
      operation: 'create',
    });
    expect(error).toBeInstanceOf(BanError);
    const rendered = ban.render(error ?? ban.error('INTERNAL_SERVER_ERROR'));
    expect(rendered.status).toBe(409);
    expect(rendered.body).toStrictEqual({
      errors: [
        {
          status: '409',
          code: 'THINGS_CODE_KEY',
          title: 'Conflict',
          detail: 'Another record already has this value.',
          source: { pointer: '/data/attributes/code' },
        },
      ],
    });
  });
});
