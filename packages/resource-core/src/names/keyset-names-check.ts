/**
 * The type-level check of the public names `@nizam-os/keyset-core` and
 * `@nizam-os/jsonapi-core` take (SPEC 11.2), the twin of `checkName` in
 * `declare/check-filters.ts`: the public name of a filtered or sortable
 * member is a keyset-core field name, and a filtered member takes no
 * member of `filter` the JSON:API definition reserves. Like the names
 * check, it examines only suspects: the members `names-check.ts` examines,
 * which give `as` or whose column the table puts at risk, and the columns
 * whose derived name is reserved. camelCase gives every other column a
 * name of ASCII letters and digits, unless the column holds a letter
 * outside ASCII, which PostgreSQL accepts unquoted, or a character only a
 * quoted identifier holds; the runtime catches both. Reading every name
 * one character at a time cost about ten instantiations a character, a
 * quarter more on stern's declarations and half again on GitLab's (SPEC
 * 15.5); a declaration without suspects costs a comparison.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { Requirement } from '../declare/requirement';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { FIELD_NAME_SYNTAX, IsFieldName } from '../jsonapi/keyset-names';
import type { FILTER_OR_MEMBER, SEARCH_MEMBER } from '../jsonapi/query-names';
import type {
  MemberOfColumn,
  PublicNameOf,
  SuspectColumn,
} from './names-check';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

type ReservedName = typeof FILTER_OR_MEMBER | typeof SEARCH_MEMBER;

/** Whether a declaration has `search`, whose parameter takes the member `q` of `filter`. */
export type HasSearch<TDecl extends Declaration> =
  MemberOf<TDecl, 'search'> extends object ? true : false;

/** The members of `filter` the JSON:API definition reserves: the disjunction, and the search member with `search`. */
type ReservedFilterName<THasSearch extends boolean> =
  | typeof FILTER_OR_MEMBER
  | (THasSearch extends true ? typeof SEARCH_MEMBER : never);

/** The columns camelCase gives a reserved name: `or` and `q` themselves, and for a relationship `or_id` and `q_id`. */
type ReservedColumn<TDecl extends Declaration> =
  | Extract<keyof Fields<TDecl>, ReservedName>
  | Extract<keyof Relationships<TDecl>, `${ReservedName}_id`>;

/** The option that uses a member's public name: `filter`, else `sort: true`, else none. */
type NameOption<TMember> =
  MemberOf<TMember, 'filter'> extends ReadonlyArray<unknown>
    ? 'filter'
    : MemberOf<TMember, 'sort'> extends true
      ? 'sort'
      : never;

type ReservedMessage<TName extends string> =
  TName extends typeof FILTER_OR_MEMBER
    ? `filter: public name "${TName}" is the filter disjunction, filter[${TName}]`
    : `filter: public name "${TName}" is the search parameter, filter[${TName}]`;

/** Why `TOption` cannot use the public name `TName`, or `never`. */
export type KeysetNameMessage<
  TOption extends 'filter' | 'sort',
  TName extends string,
  THasSearch extends boolean,
> =
  IsFieldName<TName> extends false
    ? `${TOption}: public name "${TName}" is outside @nizam-os/keyset-core's field names (${typeof FIELD_NAME_SYNTAX})`
    : TOption extends 'filter'
      ? TName extends ReservedFilterName<THasSearch>
        ? ReservedMessage<TName>
        : never
      : never;

/** The message of suspect `K`, or `never`; a relationship that needs `as` is left to the names check. */
type SuspectMessage<
  TDecl extends Declaration,
  K extends string,
  THasSearch extends boolean,
  TOption = NameOption<MemberOfColumn<TDecl, K>>,
> = [TOption] extends ['filter' | 'sort']
  ? [PublicNameOf<TDecl, K>] extends [never]
    ? never
    : KeysetNameMessage<TOption, PublicNameOf<TDecl, K>, THasSearch>
  : never;

type SuspectMessages<
  TDecl extends Declaration,
  TSuspect extends string,
  THasSearch extends boolean,
> = { readonly [K in TSuspect]: SuspectMessage<TDecl, K, THasSearch> };

type Failing<TMessages> = {
  [K in keyof TMessages]: [TMessages[K]] extends [never] ? never : K;
}[keyof TMessages];

/** The messages of the members in `TColumn` under `TGroup`; `unknown` when there is none. */
type GroupErrors<
  TGroup extends 'fields' | 'relationships',
  TMessages,
  TColumn,
> = [TColumn] extends [never]
  ? unknown
  : {
      readonly [G in TGroup]: {
        readonly [K in TColumn & keyof TMessages]: Requirement<
          TMessages[K] & string
        >;
      };
    };

type SuspectErrors<
  TDecl extends Declaration,
  TMessages,
  TFailing = Failing<TMessages>,
> = [TFailing] extends [never]
  ? unknown
  : GroupErrors<'fields', TMessages, TFailing & keyof Fields<TDecl>> &
      GroupErrors<
        'relationships',
        TMessages,
        Exclude<TFailing & keyof Relationships<TDecl>, keyof Fields<TDecl>>
      >;

/** What the public names of a declaration's filtered and sortable members require. */
export type KeysetNamesCheck<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TSuspect = SuspectColumn<TTableDef, TDecl> | ReservedColumn<TDecl>,
> = [TSuspect] extends [never]
  ? unknown
  : SuspectErrors<
      TDecl,
      SuspectMessages<TDecl, TSuspect & string, HasSearch<TDecl>>
    >;
