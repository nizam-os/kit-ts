import type { Declaration } from '../declare/types';
import type { ContactsCatalog } from '../test-support/contacts';
import type {
  HasSearch,
  KeysetNameMessage,
  KeysetNamesCheck,
} from './keyset-names-check';

import { describe, expectTypeOf, it } from 'vitest';

type Contacts = ContactsCatalog['tables']['contacts'];

/** A table whose columns derive the reserved names `or` and `q`. */
type Reserved = Omit<Contacts, 'columns'> & {
  readonly columns: Contacts['columns'] & {
    readonly or: Contacts['columns']['name'];
    readonly q: Contacts['columns']['name'];
  };
};

/** The messages `KeysetNamesCheck` puts on each member of a group. */
type Messages<
  TTableDef extends Contacts | Reserved,
  TDecl extends Declaration,
  TGroup extends 'fields' | 'relationships' = 'fields',
> =
  KeysetNamesCheck<TTableDef, TDecl> extends {
    readonly [G in TGroup]: infer TMembers;
  }
    ? { -readonly [K in keyof TMembers]: keyof TMembers[K] }
    : never;

const NAMES =
  "@nizam-os/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)";

describe('KeysetNameMessage (SPEC 11.2)', () => {
  it('names a public name outside keyset-core field names at the option that uses it', () => {
    expectTypeOf<
      KeysetNameMessage<'filter', 'größe', false>
    >().toEqualTypeOf<`filter: public name "größe" is outside ${typeof NAMES}`>();
    expectTypeOf<
      KeysetNameMessage<'sort', 'first name', true>
    >().toEqualTypeOf<`sort: public name "first name" is outside ${typeof NAMES}`>();
    expectTypeOf<KeysetNameMessage<'filter', 'createdAt', true>>().toBeNever();
  });

  it('refuses the filter disjunction always and the search member with search', () => {
    expectTypeOf<
      KeysetNameMessage<'filter', 'or', false>
    >().toEqualTypeOf<'filter: public name "or" is the filter disjunction, filter[or]'>();
    expectTypeOf<
      KeysetNameMessage<'filter', 'q', true>
    >().toEqualTypeOf<'filter: public name "q" is the search parameter, filter[q]'>();
    expectTypeOf<KeysetNameMessage<'filter', 'q', false>>().toBeNever();
    expectTypeOf<KeysetNameMessage<'sort', 'or', true>>().toBeNever();
  });
});

describe('KeysetNamesCheck (SPEC 11.2)', () => {
  it('requires nothing of a declaration without suspects', () => {
    expectTypeOf<
      KeysetNamesCheck<
        Contacts,
        {
          operations: readonly ['list'];
          fields: {
            name: { access: 'read'; filter: readonly ['eq']; sort: true };
          };
        }
      >
    >().toEqualTypeOf<unknown>();
  });

  it('reads the names given with as, and only for a member that filters or sorts', () => {
    expectTypeOf<
      Messages<
        Contacts,
        {
          operations: readonly ['list'];
          fields: {
            name: { access: 'read'; as: 'größe'; filter: readonly ['eq'] };
            nickname: { access: 'read'; as: 'nick name'; sort: true };
            email: { access: 'read'; as: 'e mail' };
          };
        }
      >
    >().toEqualTypeOf<{
      name: `filter: public name "größe" is outside ${typeof NAMES}`;
      nickname: `sort: public name "nick name" is outside ${typeof NAMES}`;
    }>();
  });

  it('reads the columns that derive a reserved name, q only with search', () => {
    type Filtered = {
      or: { access: 'read'; filter: readonly ['eq'] };
      q: { access: 'read'; filter: readonly ['eq'] };
    };
    expectTypeOf<
      Messages<
        Reserved,
        {
          operations: readonly ['list'];
          fields: Filtered;
          search: { column: 'search' };
        }
      >
    >().toEqualTypeOf<{
      or: 'filter: public name "or" is the filter disjunction, filter[or]';
      q: 'filter: public name "q" is the search parameter, filter[q]';
    }>();
    expectTypeOf<
      Messages<Reserved, { operations: readonly ['list']; fields: Filtered }>
    >().toEqualTypeOf<{
      or: 'filter: public name "or" is the filter disjunction, filter[or]';
    }>();
  });

  it('reports a relationship under relationships', () => {
    expectTypeOf<
      Messages<
        Contacts,
        {
          operations: readonly ['list'];
          fields: { name: { access: 'read' } };
          relationships: {
            organization_id: {
              target: () => void;
              access: 'read';
              as: 'or';
              filter: readonly ['eq'];
            };
          };
        },
        'relationships'
      >
    >().toEqualTypeOf<{
      organization_id: 'filter: public name "or" is the filter disjunction, filter[or]';
    }>();
  });
});

describe('HasSearch', () => {
  it('reads whether the declaration has search', () => {
    type Base = {
      operations: readonly ['list'];
      fields: { name: { access: 'read' } };
    };
    expectTypeOf<
      HasSearch<Base & { search: { column: 'search' } }>
    >().toEqualTypeOf<true>();
    expectTypeOf<HasSearch<Base>>().toEqualTypeOf<false>();
    expectTypeOf<
      HasSearch<Base & { search: undefined }>
    >().toEqualTypeOf<false>();
  });
});
