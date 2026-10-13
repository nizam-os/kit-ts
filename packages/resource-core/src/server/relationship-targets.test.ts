/**
 * `relationshipTargets` (SPEC 9.5, 12.3): the rows a write's relationships
 * name, each with the error its foreign key raises for a missing target,
 * which is the error `constraintError` makes of that violation.
 */
import type { BanError } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { unenforcedCatalog } from '../test-support/unenforced';
import {
  DRIVERS,
  Owners,
  Things,
  VIOLATIONS,
} from '../test-support/violations';
import { constraintError } from './constraint-error';
import { relationshipTargets } from './relationship-targets';

const declareContacts = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});
const Contacts = declareContacts('contacts', {
  operations: ['get'],
  scope: 'organization',
  fields: { name: { access: 'read' } },
});
/** A self-reference, and a client id that may name the row it creates. */
const Meetings = declareContacts('meetings', {
  operations: ['create', 'update'],
  scope: 'organization',
  clientIds: true,
  fields: { notes: { access: 'readWrite' } },
  relationships: {
    contact_id: { target: () => Contacts, access: 'readWrite' },
    follow_up_of_id: { target: () => Meetings, access: 'immutable' },
  },
  rules: { meetings_contact_or_notes: { validator: 'contactOrNotes' } },
});
const declareImported = createDeclareResource({
  catalog: unenforcedCatalog,
  validators: TEST_REGISTRIES.validators,
});
const ImportedOwners = declareImported('owners', {
  operations: ['get'],
  fields: {},
});
/** `owner_id` references owners through a foreign key PostgreSQL does not enforce. */
const Imported = declareImported('imported_contacts', {
  operations: ['create'],
  fields: { name: { access: 'readWrite' } },
  relationships: {
    owner_id: { target: () => ImportedOwners, access: 'readWrite' },
  },
});

const CONTACT = '00000000-0000-4000-8000-000000000001';

/** What a client receives of an error, which every occurrence of a code shares. */
function shape(error: BanError | undefined) {
  return {
    status: error?.status,
    code: error?.code,
    title: error?.title,
    detail: error?.detail,
    errors: error?.errors,
  };
}

function write(
  relationships: Readonly<Record<string, string | null>>,
  id?: string,
) {
  return { ...(id === undefined ? {} : { id }), attributes: {}, relationships };
}

describe('relationshipTargets (SPEC 9.5, 12.3)', () => {
  it("names each target with its resource and the foreign key's own error", () => {
    const [driver, raise] = DRIVERS[0] ?? [];
    const raised = constraintError(raise?.(VIOLATIONS.foreignKey), {
      resource: Things,
      operation: 'create',
    });
    const [target, ...rest] = relationshipTargets(
      Things,
      write({ owner: '7' }),
    );
    expect(driver).toBe('node-postgres');
    expect(rest).toEqual([]);
    expect(target).toMatchObject({
      relationship: 'owner',
      resource: Owners,
      id: '7',
    });
    expect(target?.error).toMatchObject({
      status: 404,
      code: 'THINGS_OWNER_ID_FKEY',
      title: 'Related Resource Not Found',
      detail: 'The related resource does not exist.',
      errors: [
        {
          detail: 'The related resource does not exist.',
          path: ['data', 'relationships', 'owner'],
        },
      ],
    });
    expect(shape(target?.error)).toEqual(shape(raised));
    expect(target?.error.cause).toBeUndefined();
  });

  it('points under the resource object an Atomic Operations operation carries', () => {
    const [target] = relationshipTargets(Things, write({ owner: '7' }), {
      pointer: '/atomic:operations/2/data',
    });
    expect(target?.error.errors?.[0]?.path).toEqual([
      'atomic:operations',
      '2',
      'data',
      'relationships',
      'owner',
    ]);
  });

  it('keeps the order the write carries, and leaves out a target it clears', () => {
    const named = relationshipTargets(
      Meetings,
      write({ followUpOf: '5', contact: CONTACT }),
    );
    expect(named.map((target) => [target.relationship, target.id])).toEqual([
      ['followUpOf', '5'],
      ['contact', CONTACT],
    ]);
    expect(named.map((target) => target.resource)).toEqual([
      Meetings,
      Contacts,
    ]);
    expect(named.map((target) => target.error.code)).toEqual([
      'MEETINGS_FOLLOW_UP_OF_ID_FKEY',
      'MEETINGS_CONTACT_ID_FKEY',
    ]);
    expect(relationshipTargets(Meetings, write({ contact: null }))).toEqual([]);
  });

  it('leaves out the row a create names by its own id, which the foreign key accepts', () => {
    expect(
      relationshipTargets(Meetings, write({ followUpOf: '5' }, '5')),
    ).toEqual([]);
    expect(
      relationshipTargets(Meetings, write({ followUpOf: '6' }, '5')),
    ).toHaveLength(1);
    expect(
      relationshipTargets(Things, write({ owner: '5' }, '5')),
    ).toHaveLength(1);
  });

  it('leaves out a target whose foreign key PostgreSQL does not enforce', () => {
    expect(relationshipTargets(Imported, write({ owner: CONTACT }))).toEqual(
      [],
    );
  });

  it('refuses what JavaScript passes that names no declared relationship', () => {
    expect(() => relationshipTargets({ ...Things }, write({}))).toThrow(
      new TypeError(
        'relationshipTargets: the resource must be a resource declareResource returned',
      ),
    );
    expect(() => relationshipTargets(Things, write({ ownr: '7' }))).toThrow(
      new TypeError('relationshipTargets: things has no relationship "ownr"'),
    );
    expect(() =>
      relationshipTargets(Things, write({}), { pointer: 'data' }),
    ).toThrow(
      new TypeError(
        'relationshipTargets: options.pointer must be an RFC 6901 JSON Pointer',
      ),
    );
  });
});
