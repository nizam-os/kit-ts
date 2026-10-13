import type { PublicTable } from '@nizam-os/catalog-core';

import type { Declaration } from '../declare/types';
import type { NamesCatalog } from '../test-support/names';
import type { CodesCheck } from './codes-check';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { namesCatalog } from '../test-support/names';

const declareResource = createDeclareResource({
  catalog: namesCatalog,
  codecs: TEST_REGISTRIES.codecs,
  validators: TEST_REGISTRIES.validators,
});

describe('CodesCheck (SPEC 4.2, 9.1)', () => {
  it('checks a given code against the pattern', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: { größe: { access: 'read' } },
      rules: { notes_größe_check: { code: 'NOTE_SIZE_NOT_POSITIVE' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: { größe: { access: 'read' } },
      rules: {
        // @ts-expect-error code: "note-size" is not A-Z, 0-9, _
        notes_größe_check: { code: 'note-size' },
      },
    });
  });

  it('refuses a given code another key takes', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: { body_text: { access: 'read' } },
      rules: { Notes_body_check: { code: 'NOTE_BODY_EMPTY' } },
    });
    declareResource('notes', {
      operations: ['create'],
      fields: { type: { access: 'immutable', as: 'kind' } },
      rules: {
        // @ts-expect-error code: "NOTES_TYPE_CHECK" collides with notes_type_check
        notes_type_not_null: { code: 'NOTES_TYPE_CHECK' },
      },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: { body_text: { access: 'read' } },
      rules: {
        // @ts-expect-error code: "NOTE_BODY" collides with notes_body_check
        Notes_body_check: { code: 'NOTE_BODY' },
        // @ts-expect-error code: "NOTE_BODY" collides with Notes_body_check
        notes_body_check: { code: 'NOTE_BODY' },
      },
    });
  });

  it('leaves derived codes to the runtime', () => {
    // Declaring either throws (derive-names-errors.test.ts): NOTES_GRÖSSE_CHECK
    // is not a code, and NOTES_BODY_CHECK is the code of two keys.
    declareResource('notes', {
      operations: ['get'],
      fields: { größe: { access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: { body_text: { access: 'read' } },
    });
  });

  it('refuses code on a key clients cannot violate', () => {
    declareResource('notes', {
      operations: ['get'],
      clientIds: true,
      fields: {},
      rules: { notes_pkey: { code: 'NOTE_EXISTS' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: { type: { access: 'read', as: 'kind' } },
      rules: {
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        notes_contact_id_fkey: { code: 'NOTE_CONTACT_MISSING' },
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        notes_pkey: { code: 'NOTE_EXISTS' },
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        notes_type_not_null: { code: 'NOTE_KIND_REQUIRED' },
      },
    });
  });

  it('refuses code on a foreign key over the scope column alone, which the server writes', () => {
    const declareContacts = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    const relationships = {
      organization_id: { target: () => null, access: 'read' },
    } as const;
    declareContacts('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { email: { access: 'read' } },
      relationships,
      rules: {
        contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' },
        // @ts-expect-error code: the key has no code, since clients cannot violate it
        contacts_organization_id_fkey: { code: 'CONTACT_ORGANIZATION_MISSING' },
      },
    });
    declareContacts('contacts', {
      operations: ['get'],
      fields: {},
      relationships,
      rules: {
        contacts_organization_id_fkey: { code: 'CONTACT_ORGANIZATION_MISSING' },
      },
    });
  });
});

describe('CodesCheck over wide types', () => {
  it('leaves what a table typed only as PublicTable cannot show to the runtime', () => {
    interface Members {
      readonly operations: readonly ['get'];
      readonly fields: { readonly contact: { readonly access: 'read' } };
      readonly rules: { readonly notes_pkey: { readonly code: 'NOTE_EXISTS' } };
    }
    expectTypeOf<
      CodesCheck<PublicTable, Members, never>
    >().toEqualTypeOf<unknown>();
  });

  it('leaves a declaration typed only as Declaration to the runtime', () => {
    type Notes = NamesCatalog['tables']['notes'];
    expectTypeOf<
      CodesCheck<Notes, Declaration, never>
    >().toEqualTypeOf<unknown>();
  });
});
