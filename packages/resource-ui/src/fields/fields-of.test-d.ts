import type { DeclaredResource } from '@nizam-os/resource-core';

import type { FieldDescriptor } from './fields-of';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { fieldsOf } from './fields-of';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
});

const Plans = declareResource('plans', {
  operations: ['get'],
  fields: { seats: { access: 'read' } },
});

const Organizations = declareResource('organizations', {
  operations: ['get', 'create'],
  fields: {
    name: { access: 'readWrite' },
    created_at: { access: 'read' },
  },
  relationships: { plan_id: { target: () => Plans, access: 'readWrite' } },
  rules: {
    organizations_enterprise_verified: { validator: 'enterpriseVerified' },
  },
});

describe('fieldsOf (resource SPEC 20.2)', () => {
  it('keys the descriptors by the public names, each typed with its own', () => {
    const fields = fieldsOf(Organizations, messages);
    expectTypeOf<keyof typeof fields>().toEqualTypeOf<
      'name' | 'createdAt' | 'plan'
    >();
    expectTypeOf(fields.createdAt).toEqualTypeOf<
      FieldDescriptor<'createdAt'>
    >();
    expectTypeOf(fields.plan.name).toEqualTypeOf<'plan'>();
    expectTypeOf(fields.name.label).toEqualTypeOf<() => string>();
    // @ts-expect-error -- a column name is not a public name
    expectTypeOf(fields.created_at).toBeObject();
  });

  it('keys a resource TypeScript does not know by any string', () => {
    const wide: DeclaredResource = Organizations;
    expectTypeOf(fieldsOf(wide, messages)).toEqualTypeOf<{
      readonly [x: string]: FieldDescriptor;
    }>();
  });

  it('takes a declared resource and messages', () => {
    // @ts-expect-error -- a type name is not a resource
    fieldsOf('organizations', messages);
    // @ts-expect-error -- labels alone are not messages
    fieldsOf(Organizations, { fields: {} });
  });
});
