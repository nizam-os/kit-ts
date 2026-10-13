import type { PublicTable } from '@nizam-os/catalog-core';

import type { ScopeColumnOf } from '../declare/declaration-check';
import type { ContactsCatalog } from '../test-support/contacts';
import type { NamesCatalog } from '../test-support/names';
import type { CodeNames } from './coded-keys';
import type { FieldNames, RelationshipNames, TypeNameOf } from './public-names';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { namesCatalog } from '../test-support/names';
import { NAME_CASES } from '../test-support/names-cases';

interface Catalogs {
  readonly contacts: ContactsCatalog;
  readonly names: NamesCatalog;
}

type Case = (typeof NAME_CASES)[number];

type TableDefOf<TCase extends Case> =
  Catalogs[TCase['catalog']]['tables'][TCase['table'] &
    keyof Catalogs[TCase['catalog']]['tables']] extends infer TTableDef extends
    PublicTable
    ? TTableDef
    : never;

type ObjectOf<TPairs extends ReadonlyArray<readonly [string, string]>> = {
  [P in TPairs[number] as P[0]]: P[1];
};

/** What the types derive for a case, against what it lists. */
type Derived<TCase extends Case> = {
  type: TypeNameOf<TableDefOf<TCase>, TCase['declaration']>;
  fields: FieldNames<TCase['declaration']>;
  relationships: RelationshipNames<TCase['declaration']>;
  codes: CodeNames<
    TableDefOf<TCase>,
    TCase['declaration'],
    ScopeColumnOf<
      typeof TEST_REGISTRIES & { catalog: ContactsCatalog },
      TCase['declaration']
    >
  >;
};
type Expected<TCase extends Case> = {
  type: TCase['names']['type'];
  fields: ObjectOf<TCase['names']['fields']>;
  relationships: ObjectOf<TCase['names']['relationships']>;
  codes: ObjectOf<TCase['names']['codes']>;
};

describe('the type-level names, the twins of deriveNames (SPEC 4.1, 4.3, 9.1)', () => {
  it('derive what the case table lists, case by case', () => {
    expectTypeOf<Derived<(typeof NAME_CASES)[0]>>().toEqualTypeOf<
      Expected<(typeof NAME_CASES)[0]>
    >();
    expectTypeOf<Derived<(typeof NAME_CASES)[1]>>().toEqualTypeOf<
      Expected<(typeof NAME_CASES)[1]>
    >();
    expectTypeOf<Derived<(typeof NAME_CASES)[2]>>().toEqualTypeOf<
      Expected<(typeof NAME_CASES)[2]>
    >();
    expectTypeOf<Derived<(typeof NAME_CASES)[3]>>().toEqualTypeOf<
      Expected<(typeof NAME_CASES)[3]>
    >();
    expectTypeOf<(typeof NAME_CASES)['length']>().toEqualTypeOf<4>();
  });

  it('accept each case declaration as declareResource checks it', () => {
    const declareContacts = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    const declareNotes = createDeclareResource({
      catalog: namesCatalog,
      codecs: TEST_REGISTRIES.codecs,
      validators: TEST_REGISTRIES.validators,
    });
    const [contacts, meetings, notes, organizations] = NAME_CASES;
    declareContacts(contacts.table, contacts.declaration);
    declareContacts(meetings.table, meetings.declaration);
    declareNotes(notes.table, notes.declaration);
    declareContacts(organizations.table, organizations.declaration);
  });
});
