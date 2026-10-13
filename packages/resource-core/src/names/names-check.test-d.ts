import type { PublicTable } from '@nizam-os/catalog-core';

import type { Declaration } from '../declare/types';
import type { NamesCatalog } from '../test-support/names';
import type { NamesCheck } from './names-check';

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
const target = (): undefined => undefined;

describe('NamesCheck: the type (SPEC 4.2)', () => {
  it('needs as for a table whose name cannot be a type', () => {
    declareResource('legacy$notes', {
      as: 'legacyNotes',
      operations: ['get'],
      fields: {},
    });
    declareResource('constructor', {
      as: 'builders',
      operations: ['get'],
      fields: {},
    });
    // @ts-expect-error the type "legacy$notes" is not a JSON:API member name; set as
    declareResource('legacy$notes', { operations: ['get'], fields: {} });
    // @ts-expect-error the type "constructor" is a member of Object.prototype; set as
    declareResource('constructor', { operations: ['get'], fields: {} });
  });

  it('checks as, and lets a type be a resource object member name', () => {
    declareResource('notes', { as: 'type', operations: ['get'], fields: {} });
    declareResource('notes', {
      // @ts-expect-error as: "notes!" is not a JSON:API member name
      as: 'notes!',
      operations: ['get'],
      fields: {},
    });
    declareResource('notes', {
      // @ts-expect-error as: "prototype" is a member of Object.prototype
      as: 'prototype',
      operations: ['get'],
      fields: {},
    });
  });
});

describe('NamesCheck: fields and relationships (SPEC 4.1, 4.2)', () => {
  it('needs as for a derived name a member cannot take', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: {
        type: { access: 'read', as: 'kind' },
        lid: { access: 'read', as: 'localId' },
        constructor: { access: 'read', as: 'builder' },
        _tmp: { access: 'read', as: 'tmp' },
        price$: { access: 'read', as: 'price' },
      },
    });
    // One mistake a declaration, so the per-table guard must find each alone.
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "type" is a member of every resource object; set as
      fields: { type: { access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "lid" is a member of every resource object; set as
      fields: { lid: { access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "constructor" is a member of Object.prototype; set as
      fields: { constructor: { access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "_Tmp" is not a JSON:API member name; set as
      fields: { _tmp: { access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "price$" is not a JSON:API member name; set as
      fields: { price$: { access: 'read' } },
    });
  });

  it('checks a given name', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: {
        // @ts-expect-error as: "id" is a member of every resource object
        contact: { access: 'read', as: 'id' },
        // @ts-expect-error as: "a.b" is not a JSON:API member name
        body_text: { access: 'read', as: 'a.b' },
      },
    });
  });

  it('refuses two members under one name, derived or given', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: {
        contact: { access: 'read', as: 'contactName' },
        created_at: { access: 'read' },
      },
      relationships: { contact_id: { target, access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: {
        // @ts-expect-error public name "bodyText" collides with fields.bodyText; set as
        body_text: { access: 'read' },
        // @ts-expect-error public name "bodyText" collides with fields.body_text; set as
        bodyText: { access: 'read' },
      },
    });
    declareResource('notes', {
      operations: ['get'],
      // @ts-expect-error public name "contact" collides with relationships.contact_id; set as
      fields: { contact: { access: 'read' } },
      // @ts-expect-error public name "contact" collides with fields.contact; set as
      relationships: { contact_id: { target, access: 'read' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: {
        // @ts-expect-error as: "kind" collides with fields.type
        contact: { access: 'read', as: 'kind' },
        // @ts-expect-error as: "kind" collides with fields.contact
        type: { access: 'read', as: 'kind' },
      },
    });
  });

  it('accepts one of two columns that derive one name', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: { bodyText: { access: 'read' } },
      relationships: { contact_id: { target, access: 'read' } },
    });
  });

  it('needs as for a relationship column without _id', () => {
    declareResource('notes', {
      operations: ['get'],
      fields: {},
      relationships: { author: { target, access: 'read', as: 'author' } },
    });
    declareResource('notes', {
      operations: ['get'],
      fields: {},
      relationships: {
        // @ts-expect-error the column does not end in _id; set as
        author: { target, access: 'read' },
      },
    });
  });
});

describe('NamesCheck: columns that are not plain (SPEC 4.2)', () => {
  it('finds the names camelCase merges or reserves', () => {
    declareResource('addresses', {
      operations: ['get'],
      fields: { line_1: { access: 'read' }, street__name: { access: 'read' } },
    });
    declareResource('addresses', {
      operations: ['get'],
      fields: {
        // @ts-expect-error public name "line1" collides with fields.line1; set as
        line_1: { access: 'read' },
        // @ts-expect-error public name "line1" collides with fields.line_1; set as
        line1: { access: 'read' },
      },
    });
    declareResource('addresses', {
      operations: ['get'],
      fields: {
        // @ts-expect-error public name "streetName" collides with fields.street_name; set as
        street__name: { access: 'read' },
        // @ts-expect-error public name "streetName" collides with fields.street__name; set as
        street_name: { access: 'read' },
      },
    });
    declareResource('addresses', {
      operations: ['get'],
      // @ts-expect-error public name "type" is a member of every resource object; set as
      fields: { type_: { access: 'read' } },
    });
  });

  it('needs as for a relationship whose name is reserved', () => {
    declareResource('addresses', {
      operations: ['get'],
      fields: {},
      relationships: {
        constructor_id: { target, access: 'read', as: 'builder' },
      },
    });
    declareResource('addresses', {
      operations: ['get'],
      fields: {},
      relationships: {
        // @ts-expect-error public name "constructor" is a member of Object.prototype; set as
        constructor_id: { target, access: 'read' },
      },
    });
  });

  it('leaves to the runtime what a quoted identifier or a Unicode case mapping causes', () => {
    // Declaring either throws (derive-names-errors.test.ts): suite- is not a
    // member name, and both a_ß and a_s_s give aSS.
    declareResource('addresses', {
      operations: ['get'],
      fields: { 'suite-': { access: 'read' } },
    });
    declareResource('addresses', {
      operations: ['get'],
      fields: { a_ß: { access: 'read' }, a_s_s: { access: 'read' } },
    });
  });
});

describe('NamesCheck on a table whose columns are all plain', () => {
  const declareContact = createDeclareResource({
    catalog: contactsCatalog,
    ...TEST_REGISTRIES,
  });

  it('checks a given name against the derived ones', () => {
    declareContact('contacts', {
      operations: ['get'],
      fields: {
        // @ts-expect-error as: "createdAt" collides with fields.created_at
        name: { access: 'read', as: 'createdAt' },
        // @ts-expect-error public name "createdAt" collides with fields.name; set as
        created_at: { access: 'read' },
      },
    });
  });
});

describe('NamesCheck over wide types', () => {
  it('leaves what a table typed only as PublicTable cannot show to the runtime', () => {
    interface Members {
      readonly operations: readonly ['get'];
      readonly fields: { readonly contact: { readonly access: 'read' } };
    }
    expectTypeOf<NamesCheck<PublicTable, Members>>().toEqualTypeOf<unknown>();
  });

  it('leaves a declaration typed only as Declaration to the runtime', () => {
    type Notes = NamesCatalog['tables']['notes'];
    expectTypeOf<NamesCheck<Notes, Declaration>>().toEqualTypeOf<unknown>();
  });
});
