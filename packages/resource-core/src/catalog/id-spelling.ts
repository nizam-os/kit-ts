/**
 * How a column spells the ids it holds (SPEC 3.1, 3.4): its base type,
 * followed through its domains, by the family whose types print a value
 * alike, with the modifier that changes the text. A relationship's column
 * must spell ids as the key it references, since its text is the linkage
 * (SPEC 18.2), and PostgreSQL takes foreign keys that print the key's value
 * otherwise: a `char(4)` padded to four where its `char(6)` key pads to
 * six, a `numeric(10,3)` as `1.500` where its `numeric(10,2)` key prints
 * `1.50`, a `float8` as `1.100000023841858` where its `real` key prints
 * `1.1`. `IdSpelling` is the type-level twin.
 * @ref https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 * @ref https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL
 * @packageDocumentation
 */
import type { PublicCatalog, PublicColumn } from '@nizam-os/catalog-core';

import type { ResolveColumnType } from './resolve-type';

import { ownValue } from '../internal/object';
import { resolveColumnType } from './columns';

/** The type modifiers of a column or a domain. */
type Modifiers = Pick<PublicColumn, 'maxLength' | 'precision' | 'scale'>;

/** The base types that print a value alike: the integers, and the strings PostgreSQL never pads. */
const FAMILIES: Readonly<Record<string, string>> = {
  int2: 'integer',
  int4: 'integer',
  int8: 'integer',
  text: 'text',
  varchar: 'text',
};

/**
 * The record whose modifiers apply to the base type: the innermost
 * domain's, since PostgreSQL takes no modifier on a domain's type, or the
 * column's own. `resolveColumnType` has found each of `domains`.
 */
function baseRecord(
  catalog: PublicCatalog,
  column: PublicColumn,
  domains: ReadonlyArray<string>,
): Modifiers {
  const innermost = domains.at(-1);
  const domain =
    innermost === undefined ? undefined : ownValue(catalog.domains, innermost);
  return domain ?? column;
}

/**
 * The spelling of the ids `column` holds: a `bpchar` with its length, a
 * `numeric` with its scale (`numeric` alone keeps the scale it is given),
 * an integer or an unpadded string by its family, and any other type by
 * its name. Throws `TypeError` naming `what` for a domain the catalog
 * does not hold.
 */
export function idSpelling(
  catalog: PublicCatalog,
  column: PublicColumn,
  what: string,
): string {
  const { type, domains } = resolveColumnType(catalog, column, what);
  const record = baseRecord(catalog, column, domains);
  if (type === 'bpchar') {
    return `bpchar(${String(record.maxLength)})`;
  }
  if (type === 'numeric') {
    return record.precision === null
      ? 'numeric'
      : `numeric(${String(record.scale ?? 0)})`;
  }
  return ownValue(FAMILIES, type) ?? type;
}

/** The type-level `baseRecord`. */
type BaseRecord<
  TCatalog extends PublicCatalog,
  TColumn extends PublicColumn,
  TDomains,
> = TDomains extends readonly [
  ...ReadonlyArray<string>,
  infer TInnermost extends keyof TCatalog['domains'],
]
  ? TCatalog['domains'][TInnermost]
  : TColumn;

type SpellingOf<
  TType extends string,
  TRecord extends Modifiers,
> = TType extends 'bpchar'
  ? `bpchar(${TRecord['maxLength']})`
  : TType extends 'numeric'
    ? TRecord['precision'] extends null
      ? 'numeric'
      : `numeric(${TRecord['scale'] extends null ? 0 : TRecord['scale']})`
    : TType extends 'int2' | 'int4' | 'int8'
      ? 'integer'
      : TType extends 'text' | 'varchar'
        ? 'text'
        : TType;

/** The spelling of the ids a column holds, as `idSpelling` gives it. */
export type IdSpelling<
  TCatalog extends PublicCatalog,
  TColumn extends PublicColumn,
> =
  ResolveColumnType<TCatalog, TColumn> extends {
    readonly type: infer TType extends string;
    readonly domains: infer TDomains;
  }
    ? SpellingOf<TType, BaseRecord<TCatalog, TColumn, TDomains>>
    : never;
