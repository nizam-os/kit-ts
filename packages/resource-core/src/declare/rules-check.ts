/**
 * The type-level check of `rules` (SPEC 3.5), the twin of `check-rules.ts`:
 * keys are constraint names or NOT NULL keys, a validator covers exactly an
 * enforced CHECK without a rule and accepts what that CHECK's members hold
 * (SPEC 7.2), and every such CHECK over a written column names one.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type {
  ConstraintName,
  RuleKey,
  UntranslatedCheck,
} from '../catalog/types';
import type { AttachmentRequirement } from '../schema/validator-input';
import type { WrittenColumn } from './members';
import type { DeclareContext } from './registries';
import type { KnownMembers, Requirement, RequireWhen } from './requirement';
import type {
  Declaration,
  DeclaredMembers,
  MemberOf,
  RuleDeclaration,
} from './types';

type Rules<TDecl extends Declaration> = DeclaredMembers<TDecl, 'rules'>;

type ValidatorName<TContext extends DeclareContext> =
  keyof TContext['validators'] & string;

type ValidatorRequirement<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  K,
  TValidator,
> = TValidator extends string
  ? TValidator extends ValidatorName<TContext>
    ? K extends UntranslatedCheck<TTableDef>
      ? AttachmentRequirement<TContext, TTableDef, TDecl, K, TValidator>
      : K extends ConstraintName<TTableDef>
        ? TTableDef['constraints'][K] extends {
            readonly kind: 'check';
            readonly enforced: false;
          }
          ? Requirement<'validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it'>
          : TTableDef['constraints'][K] extends { readonly kind: 'check' }
            ? Requirement<'validator: the CHECK has a rule, which enforces it already'>
            : Requirement<'validator: a validator covers only a CHECK without a rule'>
        : Requirement<'validator: a validator covers only a CHECK without a rule'>
    : Requirement<`validator: "${TValidator}" is not a validator of createDeclareResource`>
  : unknown;

/** `rules`, key by key, split as `FieldsCheck` in `fields-check.ts`. */
type RuleMembersCheck<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  readonly [K in keyof Rules<TDecl>]: K extends RuleKey<TTableDef>
    ? KnownMembers<
        Rules<TDecl>[K],
        keyof RuleDeclaration,
        'a rule declaration'
      > &
        ValidatorRequirement<
          TContext,
          TTableDef,
          TDecl,
          K,
          MemberOf<Rules<TDecl>[K], 'validator'>
        >
    : unknown;
} & RuleKeyErrors<TTable, Exclude<keyof Rules<TDecl>, RuleKey<TTableDef>>>;

type RuleKeyErrors<TTable extends string, TInvalid> = [TInvalid] extends [never]
  ? unknown
  : {
      readonly [
        K in TInvalid & string
      ]: `"${K}" is not a constraint or NOT NULL key of ${TTable}`;
    };

/** Enforced CHECKs without a rule over a written column whose rule names no validator (SPEC 3.5). */
type MissingValidator<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [K in UntranslatedCheck<TTableDef>]: [
    Extract<
      TTableDef['constraints'][K]['columns'][number],
      WrittenColumn<TDecl>
    >,
  ] extends [never]
    ? never
    : K extends keyof Rules<TDecl>
      ? MemberOf<Rules<TDecl>[K], 'validator'> extends string
        ? never
        : K
      : K;
}[UntranslatedCheck<TTableDef>];

/** The validators a declaration must name, and what its `rules` may hold. */
export type RulesCheck<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = RequireWhen<
  [MissingValidator<TTableDef, TDecl>] extends [never] ? false : true,
  `rules.${MissingValidator<TTableDef, TDecl> & string}: a CHECK without a rule needs a validator`
> &
  (TDecl['rules'] extends object
    ? { readonly rules: RuleMembersCheck<TContext, TTable, TTableDef, TDecl> }
    : unknown);
