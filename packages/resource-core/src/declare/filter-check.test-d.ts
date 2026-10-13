import type {
  PublicCatalog,
  PublicColumn,
  PublicDomain,
  PublicTable,
  TypeKind,
} from '@nizam-os/catalog-core';

import type { KeysetTypeOf } from '../jsonapi/keyset-types';
import type { ContactsCatalog } from '../test-support/contacts';
import type { FilterRequirement } from './filter-check';
import type { DeclareContext } from './registries';
import type { FieldDeclaration } from './types';

import { describe, expectTypeOf, it } from 'vitest';

type Column<
  TType extends string,
  TKind extends TypeKind = 'base',
  TArray extends boolean = false,
  TNullable extends boolean = true,
> = Omit<PublicColumn, 'type' | 'typeKind' | 'array' | 'nullable'> & {
  readonly type: TType;
  readonly typeKind: TKind;
  readonly array: TArray;
  readonly nullable: TNullable;
};

type Things = Omit<PublicTable, 'columns'> & {
  readonly columns: {
    readonly id: Column<'uuid', 'base', false, false>;
    readonly flag: Column<'bool'>;
    readonly slug: Column<'varchar'>;
    readonly handle: Column<'extensions.citext'>;
    readonly ratio: Column<'float8'>;
    readonly day: Column<'date'>;
    readonly at: Column<'timestamp'>;
    readonly moods: Column<'mood', 'enum', true>;
    readonly labels: Column<'label', 'domain', true>;
    readonly label: Column<'label', 'domain'>;
    readonly nothing: Column<'void_kind', 'enum'>;
  };
};

type ThingsCatalog = Omit<PublicCatalog, 'enums' | 'domains' | 'tables'> & {
  readonly enums: {
    readonly mood: readonly ['calm', 'tense'];
    readonly void_kind: readonly [];
  };
  readonly domains: {
    readonly label: Omit<
      PublicDomain,
      'type' | 'typeKind' | 'array' | 'constraints'
    > & {
      readonly type: 'text';
      readonly typeKind: 'base';
      readonly array: false;
      readonly constraints: {
        readonly label_check: {
          readonly kind: 'check';
          readonly rule: {
            readonly kind: 'enum';
            readonly values: readonly ['a', 'b'];
          };
        };
      };
    };
  };
  readonly tables: { readonly things: Things };
};

type Tables = ContactsCatalog['tables'];
type Contacts = Tables['contacts'];
type Context = DeclareContext<ContactsCatalog>;

/** The messages a field's `filter`, `sort`, and `codec` require, `never` when none; passed as `fieldsCheck` passes them. */
type Messages<
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TField extends FieldDeclaration,
> = keyof FilterRequirement<
  Context,
  TTableDef,
  TColumn,
  TField['filter'],
  TField['sort'],
  TField['codec']
>;

describe('KeysetTypeOf (SPEC 11.2)', () => {
  it('follows domains, enum labels, and enum rules as keysetTypeOf does', () => {
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'kind'>
    >().toEqualTypeOf<'enum'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'status'>
    >().toEqualTypeOf<'enum'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'email'>
    >().toEqualTypeOf<'text'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'discount'>
    >().toEqualTypeOf<'decimal'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'priority'>
    >().toEqualTypeOf<'integer'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'organization_id'>
    >().toEqualTypeOf<'bigint'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Contacts, 'tags'>
    >().toEqualTypeOf<'array'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Tables['meetings'], 'attendees'>
    >().toEqualTypeOf<'array'>();
    expectTypeOf<
      KeysetTypeOf<ContactsCatalog, Tables['audit.changes'], 'payload'>
    >().toEqualTypeOf<'type jsonb'>();
  });

  it('maps the remaining base types and names the types without one', () => {
    type Of<TColumn extends keyof Things['columns']> = KeysetTypeOf<
      ThingsCatalog,
      Things,
      TColumn
    >;
    expectTypeOf<Of<'flag'>>().toEqualTypeOf<'boolean'>();
    expectTypeOf<Of<'slug' | 'handle'>>().toEqualTypeOf<'text'>();
    expectTypeOf<Of<'ratio'>>().toEqualTypeOf<'float'>();
    expectTypeOf<Of<'day'>>().toEqualTypeOf<'date'>();
    expectTypeOf<Of<'at'>>().toEqualTypeOf<'timestamp'>();
    expectTypeOf<Of<'label'>>().toEqualTypeOf<'enum'>();
    expectTypeOf<
      Of<'moods' | 'labels'>
    >().toEqualTypeOf<'an array of enum values'>();
    expectTypeOf<Of<'nothing'>>().toEqualTypeOf<'an enum without values'>();
  });
});

describe('FilterRequirement (SPEC 11.3)', () => {
  it('requires nothing of a member that declares neither, or declares what its type takes', () => {
    expectTypeOf<Messages<Contacts, 'name', { access: 'read' }>>().toBeNever();
    expectTypeOf<
      Messages<
        Contacts,
        'name',
        { access: 'read'; filter: readonly ['eq', 'startsWith']; sort: true }
      >
    >().toBeNever();
    expectTypeOf<
      Messages<
        Contacts,
        'nickname',
        { access: 'read'; filter: readonly ['isNull'] }
      >
    >().toBeNever();
    expectTypeOf<
      Messages<
        Contacts,
        'tags',
        { access: 'read'; filter: readonly ['overlaps'] }
      >
    >().toBeNever();
    expectTypeOf<
      Messages<
        Contacts,
        'created_at',
        { access: 'read'; filter: readonly ['gt', 'lte']; sort: false }
      >
    >().toBeNever();
  });

  it('requires at least one operator, each listed once', () => {
    expectTypeOf<
      Messages<Contacts, 'name', { access: 'read'; filter: readonly [] }>
    >().toEqualTypeOf<'filter: list at least one operator'>();
    expectTypeOf<
      Messages<
        Contacts,
        'name',
        { access: 'read'; filter: readonly ['eq', 'in', 'eq'] }
      >
    >().toEqualTypeOf<'filter: an operator is listed twice'>();
    expectTypeOf<
      Messages<Contacts, 'name', { access: 'read'; filter: Array<'eq'> }>
    >().toBeNever();
  });

  it('names each operator the keyset type does not take, and isNull on a non-null member', () => {
    expectTypeOf<
      Messages<Contacts, 'tags', { access: 'read'; filter: readonly ['gt'] }>
    >().toEqualTypeOf<'filter: operator "gt" is not available for array fields'>();
    expectTypeOf<
      Messages<
        Contacts,
        'status',
        { access: 'read'; filter: readonly ['gt', 'contains'] }
      >
    >().toEqualTypeOf<
      | 'filter: operator "gt" is not available for enum fields'
      | 'filter: operator "contains" is not available for enum fields'
    >();
    expectTypeOf<
      Messages<
        Contacts,
        'name',
        { access: 'read'; filter: readonly ['isNull'] }
      >
    >().toEqualTypeOf<'filter: operator "isNull" is not available for non-null fields'>();
    expectTypeOf<
      Messages<
        Tables['meetings'],
        'notes',
        { access: 'read'; filter: readonly ['isNull'] }
      >
    >().toEqualTypeOf<'filter: operator "isNull" is not available for non-null fields'>();
  });

  it('checks a relationship, whose absent members are undefined, by its foreign-key column', () => {
    expectTypeOf<
      keyof FilterRequirement<
        Context,
        Contacts,
        'organization_id',
        undefined,
        undefined,
        undefined
      >
    >().toBeNever();
    expectTypeOf<
      keyof FilterRequirement<
        Context,
        Contacts,
        'organization_id',
        readonly ['in', 'isNull'],
        undefined,
        undefined
      >
    >().toEqualTypeOf<'filter: operator "isNull" is not available for non-null fields'>();
    expectTypeOf<
      keyof FilterRequirement<
        Context,
        Tables['meetings'],
        'contact_id',
        readonly ['eq', 'isNull'],
        undefined,
        undefined
      >
    >().toBeNever();
  });

  it('refuses filter and sort without a keyset type, and sort on an array', () => {
    expectTypeOf<
      Messages<
        Tables['audit.changes'],
        'payload',
        { access: 'read'; filter: readonly ['eq']; sort: true }
      >
    >().toEqualTypeOf<
      | 'filter: type jsonb is not filterable'
      | 'sort: type jsonb is not sortable'
    >();
    expectTypeOf<
      Messages<
        Contacts,
        'website',
        { access: 'read'; codec: 'phone'; sort: true }
      >
    >().toEqualTypeOf<'sort: a codec field is not sortable'>();
    expectTypeOf<
      Messages<Contacts, 'tags', { access: 'read'; sort: true }>
    >().toEqualTypeOf<'sort: an array field is not sortable'>();
  });
});
