/**
 * Nullability and the requirement on insert in types (SPEC 6.1 step 4,
 * 6.3), the twins of `memberSpec`: a column is effectively nullable unless
 * a `notNull` rule on it, or a NOT NULL domain or a domain's `notNull` rule
 * above its first array, forbids `NULL`; it is required on insert when it
 * is not nullable and has no default, on the column or such a domain, and
 * no identity or generation.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicDomain,
  PublicTable,
} from '@nizam-os/catalog-core';

/** The columns with a `notNull` rule among the enforced CHECKs over exactly them; computed once per table. */
type NotNullRuleColumns<TTableDef extends PublicTable> = {
  [K in keyof TTableDef['constraints']]: TTableDef['constraints'][K] extends {
    readonly kind: 'check';
    readonly columns: readonly [infer TColumn extends string];
    readonly rule: { readonly kind: 'notNull' };
    readonly enforced: true;
  }
    ? TColumn
    : never;
}[keyof TTableDef['constraints']];

/** Whether a domain forbids `NULL`: NOT NULL, or a `notNull` rule. */
type DomainNotNull<TDomain extends PublicDomain> =
  TDomain['nullable'] extends false
    ? true
    : true extends {
          [
            K in keyof TDomain['constraints']
          ]: TDomain['constraints'][K] extends {
            readonly rule: { readonly kind: 'notNull' };
          }
            ? true
            : false;
        }[keyof TDomain['constraints']]
      ? true
      : false;

/** What the domains above a type's first array say: whether one forbids `NULL`, and whether one has a default. */
interface TopDomainFacts {
  readonly notNull: boolean;
  readonly hasDefault: boolean;
}

type Facts<TNotNull extends boolean, THasDefault extends boolean> = {
  readonly notNull: TNotNull;
  readonly hasDefault: THasDefault;
};

type Or<TLeft extends boolean, TRight extends boolean> = TLeft extends true
  ? true
  : TRight;

type FollowDomains<
  TCatalog extends PublicCatalog,
  TRecord extends Pick<PublicColumn, 'type' | 'typeKind' | 'array'>,
  TFacts extends TopDomainFacts,
> = TRecord['array'] extends true
  ? TFacts
  : TRecord['typeKind'] extends 'domain'
    ? TRecord['type'] extends keyof TCatalog['domains']
      ? FollowDomains<
          TCatalog,
          TCatalog['domains'][TRecord['type']],
          Facts<
            Or<
              TFacts['notNull'],
              DomainNotNull<TCatalog['domains'][TRecord['type']]>
            >,
            Or<
              TFacts['hasDefault'],
              TCatalog['domains'][TRecord['type']]['default'] extends null
                ? false
                : true
            >
          >
        >
      : TFacts
    : TFacts;

/** The facts of the domains above a column's (or a domain's) first array. */
export type TopDomains<
  TCatalog extends PublicCatalog,
  TColumn extends Pick<PublicColumn, 'type' | 'typeKind' | 'array'>,
> = FollowDomains<TCatalog, TColumn, Facts<false, false>>;

/** Whether a member's column is effectively nullable (SPEC 6.1 step 4). */
export type IsNullable<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
> = TTableDef['columns'][TColumn]['nullable'] extends false
  ? false
  : TColumn extends NotNullRuleColumns<TTableDef>
    ? false
    : TopDomains<TCatalog, TTableDef['columns'][TColumn]> extends {
          readonly notNull: true;
        }
      ? false
      : true;

/** Whether a member's column is required on insert (SPEC 6.3). */
export type IsRequired<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
> =
  IsNullable<TCatalog, TTableDef, TColumn> extends true
    ? false
    : TTableDef['columns'][TColumn] extends {
          readonly default: null;
          readonly identity: null;
          readonly generated: null;
        }
      ? TopDomains<TCatalog, TTableDef['columns'][TColumn]> extends {
          readonly hasDefault: true;
        }
        ? false
        : true
      : false;
