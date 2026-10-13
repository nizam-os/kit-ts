import type { CreateInput, UpdateInput } from '@nizam-os/jsonapi-client';
import type { DeclaredResource } from '@nizam-os/resource-core';

import type { FormValue, FormValues } from './form-types';

import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';
import { createDeclareResource } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { resourceForm } from './resource-form';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
});

const Plans = declareResource('plans', {
  operations: ['get'],
  fields: { seats: { access: 'read' } },
});

const Organizations = declareResource('organizations', {
  operations: ['get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    verified: { access: 'readWrite' },
    marketing_opt_in: { access: 'readWrite' },
    open_days: { access: 'readWrite' },
    invite_code: { access: 'write' },
    created_at: { access: 'read' },
  },
  relationships: { plan_id: { target: () => Plans, access: 'readWrite' } },
  rules: {
    organizations_enterprise_verified: { validator: 'enterpriseVerified' },
  },
});

const Contacts = declareResource('contacts', {
  operations: ['get', 'create', 'update'],
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'readWrite' },
    lifetime_value: { access: 'readWrite' },
    score: { access: 'readWrite' },
    ratings: { access: 'readWrite' },
    channels: { access: 'readWrite' },
    vip: { access: 'readWrite' },
    follow_up_at: { access: 'readWrite' },
    details: { access: 'readWrite' },
    created_at: { access: 'read' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'readWrite' },
  },
});

const transport = createTransport({ origin: 'https://api.example.test' });
const clients = createClients(
  {
    plans: Plans.resource,
    organizations: Organizations.resource,
    contacts: Contacts.resource,
  },
  transport,
);

interface ContactValues {
  readonly name: string;
  readonly nickname: string;
  readonly priority: string;
  readonly discount: string;
  readonly lifetimeValue: string;
  readonly score: string;
  readonly ratings: Array<string>;
  readonly channels: Array<string>;
  readonly vip: boolean | null;
  readonly followUpAt: string;
  readonly details: unknown;
  readonly organization: string;
}

/** On create, the immutable member too. */
interface ContactCreateValues extends ContactValues {
  readonly kind: string;
}

describe('FormValue (resource SPEC 20.3)', () => {
  it("types each member's value as its input edits it", () => {
    expectTypeOf<FormValue<boolean>>().toEqualTypeOf<boolean | null>();
    expectTypeOf<FormValue<boolean | null | undefined>>().toEqualTypeOf<
      boolean | null
    >();
    expectTypeOf<FormValue<string | null>>().toEqualTypeOf<string>();
    expectTypeOf<FormValue<number>>().toEqualTypeOf<string>();
    expectTypeOf<FormValue<'person' | 'company'>>().toEqualTypeOf<string>();
    expectTypeOf<FormValue<ReadonlyArray<number>>>().toEqualTypeOf<
      Array<string>
    >();
    expectTypeOf<FormValue<{ readonly a: number }>>().toBeUnknown();
    expectTypeOf<FormValue>().toBeUnknown();
  });
});

describe('FormValues (resource SPEC 20.3)', () => {
  it('holds every member the operation writes, by public name', () => {
    expectTypeOf<
      FormValues<typeof Contacts, 'create'>
    >().toEqualTypeOf<ContactCreateValues>();
    expectTypeOf<
      FormValues<typeof Contacts, 'update'>
    >().toEqualTypeOf<ContactValues>();
    expectTypeOf<FormValues<typeof Organizations, 'update'>>().toEqualTypeOf<{
      readonly name: string;
      readonly verified: boolean | null;
      readonly marketingOptIn: boolean | null;
      readonly openDays: Array<string>;
      readonly inviteCode: string;
      readonly plan: string;
    }>();
  });

  it('types the defaults, the validator, and the errors of the members the form holds', () => {
    const edit = resourceForm(Contacts, 'update', {
      messages,
      record: { id: '1' },
      members: ['name', 'organization'],
    });
    expectTypeOf(edit.defaultValues).toEqualTypeOf<{
      readonly name: string;
      readonly organization: string;
    }>();
    expectTypeOf(edit.errors(null).fields).toEqualTypeOf<
      Readonly<Partial<Record<'name' | 'organization', string>>>
    >();
    expectTypeOf(edit.fields[0]!.name).toEqualTypeOf<'name' | 'organization'>();
  });

  it('types a resource TypeScript does not know as a record of unknown values', () => {
    const wide: DeclaredResource = Contacts;
    expectTypeOf<FormValues<typeof wide, 'create'>>().toEqualTypeOf<
      Readonly<Record<string, unknown>>
    >();
    expectTypeOf(
      resourceForm(wide, 'create', { messages, members: ['anything'] })
        .defaultValues,
    ).toEqualTypeOf<Readonly<Record<string, unknown>>>();
  });
});

describe('the write (resource SPEC 20.3)', () => {
  it("is the input of the client's create and update", () => {
    const create = resourceForm(Contacts, 'create', { messages });
    expectTypeOf(create.write).returns.toEqualTypeOf<
      CreateInput<typeof Contacts.resource>
    >();
    expectTypeOf(create.write).returns.toExtend<
      Parameters<typeof clients.contacts.create>[0]
    >();
    const edit = resourceForm(Organizations, 'update', {
      messages,
      record: { id: '7' },
    });
    expectTypeOf(edit.write).returns.toEqualTypeOf<
      UpdateInput<typeof Organizations.resource>
    >();
    expectTypeOf(edit.write).returns.toExtend<
      Parameters<typeof clients.organizations.update>[1]
    >();
  });
});

describe('the options (resource SPEC 20.3)', () => {
  it('takes a record on update only, and members the operation writes', () => {
    const record = { id: '1' };
    // @ts-expect-error -- an update edits a record
    resourceForm(Contacts, 'update', { messages });
    // @ts-expect-error -- a create starts from the defaults
    resourceForm(Contacts, 'create', { messages, record: { id: '1' } });
    // @ts-expect-error -- a create does not write createdAt
    resourceForm(Contacts, 'create', { messages, members: ['createdAt'] });
    // @ts-expect-error -- an update does not write kind, which is immutable
    resourceForm(Contacts, 'update', { messages, record, members: ['kind'] });
    // @ts-expect-error -- the operation is create or update
    resourceForm(Contacts, 'remove', { messages });
  });
});
