import type { input } from 'zod/v4/core';

/**
 * What a validator receives, in types (SPEC 6.1 step 5, 7.2): a field's
 * output, `null` included where the field is nullable, a relationship's id
 * or `null`, and for a CHECK over several members an object of them by
 * public name. A validator's input type must accept it, which `tsc` checks
 * where the declaration attaches the validator; a CHECK with a column that
 * is not a member never runs (`multi-column.ts`), so it is not checked.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { MemberColumn } from '../declare/members';
import type { DeclareContext } from '../declare/registries';
import type { Requirement } from '../declare/requirement';
import type { Declaration, DeclaredMembers } from '../declare/types';
import type { FieldNameOf, RelationshipNameOf } from '../names/public-names';
import type { IsNullable } from './member-types';
import type { ColumnOf, FieldOut, NullWhen } from './resource-types';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** What a validator receives for one member column. */
type MemberInput<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TColumn extends string,
> = TColumn extends keyof Fields<TDecl>
  ? FieldOut<
      TContext,
      TTableDef,
      ColumnOf<TTableDef, TColumn>,
      Fields<TDecl>[TColumn]
    >
  :
      | string
      | NullWhen<
          IsNullable<
            TContext['catalog'],
            TTableDef,
            ColumnOf<TTableDef, TColumn>
          >
        >;

type PublicName<
  TDecl extends Declaration,
  TColumn,
> = TColumn extends keyof Fields<TDecl>
  ? FieldNameOf<TColumn & string, Fields<TDecl>[TColumn]>
  : TColumn extends keyof Relationships<TDecl>
    ? RelationshipNameOf<TColumn & string, Relationships<TDecl>[TColumn]>
    : never;

/** What a CHECK's validator receives: the member's value, or the members by public name. */
type CheckInput<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TColumns extends ReadonlyArray<string>,
> = TColumns extends readonly [infer TOnly extends string]
  ? MemberInput<TContext, TTableDef, TDecl, TOnly>
  : {
      [C in TColumns[number] as PublicName<TDecl, C>]: MemberInput<
        TContext,
        TTableDef,
        TDecl,
        C
      >;
    };

type Names<
  TDecl extends Declaration,
  TColumns extends ReadonlyArray<string>,
> = TColumns extends readonly [
  infer THead extends string,
  ...infer TRest extends ReadonlyArray<string>,
]
  ? TRest extends readonly []
    ? PublicName<TDecl, THead> & string
    : `${PublicName<TDecl, THead> & string}, ${Names<TDecl, TRest>}`
  : '';

type Problem<
  TDecl extends Declaration,
  TColumns extends ReadonlyArray<string>,
  TValidator extends string,
> = TColumns extends readonly [infer TOnly extends string]
  ? `validator: "${TValidator}" does not accept every value of ${TOnly}`
  : `validator: "${TValidator}" does not accept every object of ${Names<TDecl, TColumns>}`;

/** The requirement that the validator of CHECK `K` accept what it receives (SPEC 7.2). */
export type AttachmentRequirement<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  K,
  TValidator extends keyof TContext['validators'] & string,
> = TTableDef['constraints'][K & keyof TTableDef['constraints']] extends {
  readonly columns: infer TColumns extends ReadonlyArray<string>;
}
  ? [Exclude<TColumns[number], MemberColumn<TDecl>>] extends [never]
    ? [CheckInput<TContext, TTableDef, TDecl, TColumns>] extends [
        input<TContext['validators'][TValidator]['schema']>,
      ]
      ? unknown
      : Requirement<Problem<TDecl, TColumns, TValidator>>
    : unknown
  : unknown;
