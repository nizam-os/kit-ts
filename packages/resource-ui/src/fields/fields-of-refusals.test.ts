import type { DeclaredResource } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { createDeclareResource, defaultMessages } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { publicCatalog } from '../test-support/public-catalog';
import { Contacts, Plans } from '../test-support/resources';
import { fieldsOf } from './fields-of';

describe('fieldsOf: what a JavaScript caller got wrong (resource SPEC 20.1)', () => {
  const NOT_DECLARED =
    'fieldsOf: resource must be what a declareResource returned';

  const MEMBERS = [
    'names',
    'declaration',
    'fields',
    'write',
    'resource',
    'keyset',
  ] as const;
  const withoutOne = MEMBERS.map(
    (member) =>
      [
        `a resource's members without ${member}`,
        Object.fromEntries(
          MEMBERS.filter((name) => name !== member).map((name) => [
            name,
            Contacts[name],
          ]),
        ),
      ] as const,
  );

  it.each<readonly [string, unknown]>([
    ['null', null],
    ['a type name', 'contacts'],
    ['an object without the members', {}],
    ...withoutOne,
  ])('throws for %s in place of a resource', (_name, resource) => {
    expect(() => fieldsOf(resource as DeclaredResource, messages)).toThrow(
      new TypeError(NOT_DECLARED),
    );
  });

  it('throws for messages no definer returned, such as a copy of checked ones', () => {
    const copy = { ...messages };
    expect(() => fieldsOf(Contacts, copy)).toThrow(
      new TypeError(
        'fieldsOf: messages must be what defineMessages or defaultMessages returned',
      ),
    );
  });

  it('throws for messages that label no member of the type, defined for other resources', () => {
    expect(() => fieldsOf(Contacts, defaultMessages([Plans]))).toThrow(
      new TypeError('fieldsOf: the messages label no member of contacts'),
    );
  });

  it('throws for messages defined for another declaration of the type, which lack a member', () => {
    const declareResource = createDeclareResource({ catalog: publicCatalog });
    const Narrow = declareResource('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() => fieldsOf(Contacts, defaultMessages([Narrow]))).toThrow(
      new TypeError('fieldsOf: the messages have no label for contacts.kind'),
    );
  });

  it("throws for messages defined over another catalog, which lack one of an enum's labels", () => {
    const declaration = {
      operations: ['get'],
      fields: { kind: { access: 'read' } },
    } as const;
    const current = createDeclareResource({ catalog: publicCatalog });
    const older = createDeclareResource({
      catalog: {
        ...publicCatalog,
        enums: { ...publicCatalog.enums, contact_kind: ['person'] },
      },
    });
    const olderMessages = defaultMessages([older('contacts', declaration)]);
    expect(() =>
      fieldsOf(current('contacts', declaration), olderMessages),
    ).toThrow(
      new TypeError(
        'fieldsOf: the messages label not every option of contacts.kind',
      ),
    );
  });

  it('throws for messages defined before the member had options, which label none of them', () => {
    const declaration = {
      operations: ['get'],
      fields: { kind: { access: 'read' } },
    } as const;
    const table = publicCatalog.tables.contacts;
    const before = createDeclareResource({
      catalog: {
        ...publicCatalog,
        tables: {
          ...publicCatalog.tables,
          contacts: {
            ...table,
            columns: {
              ...table.columns,
              kind: {
                ...table.columns.kind,
                type: 'text',
                typeKind: 'base',
                sqlType: 'text',
              },
            },
          },
        },
      },
    });
    const current = createDeclareResource({ catalog: publicCatalog });
    expect(() =>
      fieldsOf(
        current('contacts', declaration),
        defaultMessages([before('contacts', declaration)]),
      ),
    ).toThrow(
      new TypeError(
        'fieldsOf: the messages label not every option of contacts.kind',
      ),
    );
  });

  it("reads the messages' own members only, never Object.prototype's", () => {
    const resource = {
      names: { ...Contacts.names, type: 'constructor' },
      declaration: Contacts.declaration,
      fields: Contacts.fields,
      write: Contacts.write,
      resource: Contacts.resource,
      keyset: Contacts.keyset,
    };
    expect(() => fieldsOf(resource, messages)).toThrow(
      new TypeError('fieldsOf: the messages label no member of constructor'),
    );
  });
});
