/**
 * The type-level check of the codes a declaration gives (SPEC 4.2, 9.1):
 * a given `code` must match `CODE_PATTERN`, sit on a coded key, and differ
 * from the resource's other codes, given or derived. Each failure is
 * reported at its rule. Derived codes come from the catalog alone, so the
 * runtime checks them when the resource is declared (`deriveNames`):
 * checking every rule key of a real catalog in types cost about as much
 * as all the other checks together (SPEC 15.5).
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { ConstraintName, RuleKey } from '../catalog/types';
import type { MemberColumn } from '../declare/members';
import type { Requirement } from '../declare/requirement';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { CodeOf, IsCode } from './code';
import type { CodedKey, CodeNames } from './coded-keys';
import type { OwnersOf } from './collisions';

type Rules<TDecl extends Declaration> = DeclaredMembers<TDecl, 'rules'>;

/** The rule keys of the table that give a `code`; a key the table lacks fails the rules check. */
type GivenCodeKey<TTableDef extends PublicTable, TDecl extends Declaration> = {
  [K in keyof Rules<TDecl>]: MemberOf<Rules<TDecl>[K], 'code'> extends string
    ? K
    : never;
}[keyof Rules<TDecl>] &
  RuleKey<TTableDef>;

/** The keys other than `K` that take code `TCode`. */
type OtherOwners<TOwners, TCode, K> = Exclude<OwnersOf<TOwners, TCode>, K>;

/** Why the code rule `K` gives fails, or `never`. */
type CodeProblem<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
  K extends string,
> =
  K extends CodedKey<TTableDef, TDecl, TScopeColumn>
    ? IsCode<CodeOf<TDecl, K>> extends false
      ? `code: "${CodeOf<TDecl, K>}" is not A-Z, 0-9, _`
      : [
            OtherOwners<
              CodeNames<TTableDef, TDecl, TScopeColumn>,
              CodeOf<TDecl, K>,
              K
            >,
          ] extends [never]
        ? never
        : `code: "${CodeOf<TDecl, K>}" collides with ${OtherOwners<CodeNames<TTableDef, TDecl, TScopeColumn>, CodeOf<TDecl, K>, K> & string}`
    : 'code: the key has no code, since clients cannot violate it';

type ProblemKey<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  [K in GivenCodeKey<TTableDef, TDecl>]: [
    CodeProblem<TTableDef, TDecl, TScopeColumn, K>,
  ] extends [never]
    ? never
    : K;
}[GivenCodeKey<TTableDef, TDecl>];

type CodeErrors<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
  TKey extends string,
> = [TKey] extends [never]
  ? unknown
  : {
      readonly rules: {
        readonly [K in TKey]: Requirement<
          CodeProblem<TTableDef, TDecl, TScopeColumn, K>
        >;
      };
    };

/** A rule declaration that gives `code`. */
interface GivesCodeRule {
  readonly code: string;
}

/** Whether a rule of the declaration gives `code`. */
type GivesCode<TDecl extends Declaration> = [
  Extract<Rules<TDecl>[keyof Rules<TDecl>], GivesCodeRule>,
] extends [never]
  ? false
  : true;

/**
 * What the given codes require of a declaration over `TTableDef`. Without
 * `code` it adds nothing, and the coded keys are never computed; members or
 * constraints typed only as `string` leave the coded keys unknown, so the
 * runtime checks the codes.
 */
export type CodesCheck<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> =
  GivesCode<TDecl> extends false
    ? unknown
    : string extends MemberColumn<TDecl> | ConstraintName<TTableDef>
      ? unknown
      : CodeErrors<
          TTableDef,
          TDecl,
          TScopeColumn,
          ProblemKey<TTableDef, TDecl, TScopeColumn>
        >;
