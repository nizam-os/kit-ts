/**
 * The type-level check of public names (SPEC 4.2), the twin of the names
 * `deriveNames` derives (`derive-names.ts`): the type and every field and
 * relationship name must be a JSON:API member name, a field or a
 * relationship must not take a member of every resource object or of
 * `Object.prototype`, no two members may share a name, and a relationship
 * column without `_id` needs `as`. Only a suspect can fail: a member that
 * gives `as`, or whose column is in the table's `TableNameRisk`. The
 * others take valid names no other plain column takes, so they are only
 * compared with the suspects; a declaration without suspects costs two
 * passes over its members.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { MemberColumn } from '../declare/members';
import type { Requirement } from '../declare/requirement';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { CamelCase } from './camel-case';
import type { CollidingOwners, OwnersOf } from './collisions';
import type { MemberNameProblem, TypeNameProblem } from './member-name';
import type { TableNameRisk } from './name-risk';
import type {
  FieldNameOf,
  IdBase,
  RelationshipNameOf,
  TypeNameOf,
} from './public-names';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** The declaration of member column `K`. */
export type MemberOfColumn<
  TDecl extends Declaration,
  K extends string,
> = K extends keyof Fields<TDecl>
  ? Fields<TDecl>[K]
  : K extends keyof Relationships<TDecl>
    ? Relationships<TDecl>[K]
    : never;

/** The public name of member column `K`; `never` for a relationship column that needs `as`. */
export type PublicNameOf<
  TDecl extends Declaration,
  K extends string,
> = K extends keyof Fields<TDecl>
  ? FieldNameOf<K, Fields<TDecl>[K]>
  : RelationshipNameOf<K, MemberOfColumn<TDecl, K>>;

/** A member declaration that gives `as`. */
interface GivesAsMember {
  readonly as: string;
}

/** Whether a field or relationship gives `as`: one pass over the member declarations. */
type GivesAs<TDecl extends Declaration> = [
  Extract<
    | Fields<TDecl>[keyof Fields<TDecl>]
    | Relationships<TDecl>[keyof Relationships<TDecl>],
    GivesAsMember
  >,
] extends [never]
  ? false
  : true;

/** The members that give `as`. */
type GivenAsColumn<TDecl extends Declaration> =
  | {
      [K in keyof Fields<TDecl>]: Fields<TDecl>[K] extends GivesAsMember
        ? K
        : never;
    }[keyof Fields<TDecl>]
  | {
      [
        K in keyof Relationships<TDecl>
      ]: Relationships<TDecl>[K] extends GivesAsMember ? K : never;
    }[keyof Relationships<TDecl>];

/**
 * The members whose name can fail: those that give `as`, listed only when
 * one does, and those whose column the table puts at risk.
 */
export type SuspectColumn<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> =
  | (GivesAs<TDecl> extends true ? GivenAsColumn<TDecl> & string : never)
  | Extract<MemberColumn<TDecl>, TableNameRisk<TTableDef>>;

type PlainField<TDecl extends Declaration, TSuspect> = Exclude<
  keyof Fields<TDecl> & string,
  TSuspect
>;
type PlainRelationship<TDecl extends Declaration, TSuspect> = Exclude<
  keyof Relationships<TDecl> & string,
  TSuspect
>;

/** The names of the members other than the suspects, as camelCase derives them. */
type PlainName<TDecl extends Declaration, TSuspect> =
  | {
      [K in PlainField<TDecl, TSuspect>]: CamelCase<K>;
    }[PlainField<TDecl, TSuspect>]
  | {
      [K in PlainRelationship<TDecl, TSuspect>]: CamelCase<IdBase<K>>;
    }[PlainRelationship<TDecl, TSuspect>];

/** The members other than the suspects that take a name in `TName`. */
type PlainOwners<TDecl extends Declaration, TSuspect, TName> =
  | {
      [K in PlainField<TDecl, TSuspect>]: CamelCase<K> extends TName
        ? K
        : never;
    }[PlainField<TDecl, TSuspect>]
  | {
      [K in PlainRelationship<TDecl, TSuspect>]: CamelCase<
        IdBase<K>
      > extends TName
        ? K
        : never;
    }[PlainRelationship<TDecl, TSuspect>];

/**
 * Each suspect's name, mapped to the suspects that take it: remapped keys
 * that coincide merge into a union (`collisions.ts`).
 * @ref https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as
 */
type SuspectOwners<TDecl extends Declaration, TSuspect extends string> = {
  [K in TSuspect as PublicNameOf<TDecl, K>]: K;
};

/** The members that take name `TName`. */
type Owners<TDecl extends Declaration, TSuspect extends string, TName> =
  | OwnersOf<SuspectOwners<TDecl, TSuspect>, TName>
  | PlainOwners<TDecl, TSuspect, TName>;

/** The suspects without a name, or whose name is not a member name. */
type InvalidSuspect<TDecl extends Declaration, TSuspect extends string> = {
  [K in TSuspect]: [PublicNameOf<TDecl, K>] extends [never]
    ? K
    : [MemberNameProblem<PublicNameOf<TDecl, K>>] extends [never]
      ? never
      : K;
}[TSuspect];

/** The suspects whose name another member derives from a plain column. */
type PlainCollision<TDecl extends Declaration, TSuspect extends string> = {
  [K in TSuspect]: [PublicNameOf<TDecl, K>] extends [never]
    ? never
    : PublicNameOf<TDecl, K> extends PlainName<TDecl, TSuspect>
      ? K
      : never;
}[TSuspect];

type ProblemColumn<TDecl extends Declaration, TSuspect extends string> =
  | InvalidSuspect<TDecl, TSuspect>
  | (CollidingOwners<SuspectOwners<TDecl, TSuspect>> & string)
  | ([PlainCollision<TDecl, TSuspect>] extends [never]
      ? never
      :
          | PlainCollision<TDecl, TSuspect>
          | PlainOwners<TDecl, TSuspect, keyof SuspectOwners<TDecl, TSuspect>>);

type OwnerPath<TDecl extends Declaration, TOwner> = TOwner extends string
  ? TOwner extends keyof Fields<TDecl>
    ? `fields.${TOwner}`
    : `relationships.${TOwner}`
  : never;

/** Why member column `K` cannot take its public name; built only for a column that fails. */
type NameProblem<
  TDecl extends Declaration,
  TSuspect extends string,
  K extends string,
> = [PublicNameOf<TDecl, K>] extends [never]
  ? 'suffix'
  : [MemberNameProblem<PublicNameOf<TDecl, K>>] extends [never]
    ? `collides with ${OwnerPath<TDecl, Exclude<Owners<TDecl, TSuspect, PublicNameOf<TDecl, K>>, K>>}`
    : MemberNameProblem<PublicNameOf<TDecl, K>>;

type NameMessage<
  TDecl extends Declaration,
  TSuspect extends string,
  K extends string,
> =
  NameProblem<TDecl, TSuspect, K> extends 'suffix'
    ? 'the column does not end in _id; set as'
    : MemberOf<MemberOfColumn<TDecl, K>, 'as'> extends string
      ? `as: "${PublicNameOf<TDecl, K>}" ${NameProblem<TDecl, TSuspect, K>}`
      : `public name "${PublicNameOf<TDecl, K>}" ${NameProblem<TDecl, TSuspect, K>}; set as`;

/** The messages of the members in `TColumn` that fail, under `TGroup`; `unknown` when none does. */
type GroupErrors<
  TDecl extends Declaration,
  TSuspect extends string,
  TGroup extends 'fields' | 'relationships',
  TColumn,
> = [TColumn] extends [never]
  ? unknown
  : {
      readonly [G in TGroup]: {
        readonly [K in TColumn & string]: Requirement<
          NameMessage<TDecl, TSuspect, K>
        >;
      };
    };

/** What the names of the members require, given the suspects. */
type MemberNamesCheck<
  TDecl extends Declaration,
  TSuspect extends string,
  TProblem = ProblemColumn<TDecl, TSuspect>,
> = [TProblem] extends [never]
  ? unknown
  : GroupErrors<TDecl, TSuspect, 'fields', TProblem & keyof Fields<TDecl>> &
      GroupErrors<
        TDecl,
        TSuspect,
        'relationships',
        Exclude<TProblem & keyof Relationships<TDecl>, keyof Fields<TDecl>>
      >;

type TypeCheck<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TName extends string,
> = [TypeNameProblem<TName>] extends [never]
  ? unknown
  : MemberOf<TDecl, 'as'> extends string
    ? {
        readonly as: Requirement<`as: "${TName}" ${TypeNameProblem<TName>}`>;
      }
    : Requirement<`the type "${TTableDef['name']}" ${TypeNameProblem<TName>}; set as`>;

/**
 * What the public names require of a declaration over `TTableDef`. A
 * member outside the group its column admits fails the fields or
 * relationships check instead.
 */
export type NamesCheck<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = TypeCheck<TTableDef, TDecl, TypeNameOf<TTableDef, TDecl>> &
  ([SuspectColumn<TTableDef, TDecl>] extends [never]
    ? unknown
    : MemberNamesCheck<TDecl, SuspectColumn<TTableDef, TDecl>>);
