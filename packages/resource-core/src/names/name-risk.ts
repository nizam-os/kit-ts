/**
 * The columns of a table whose derived public name may fail or be shared
 * (SPEC 4.2). The names check examines only the members in this set, and
 * those that give `as`: every other column is plain, and camelCase gives
 * plain columns valid names that no other plain column takes. The set
 * reads only the catalog, so TypeScript computes it once per table and
 * reuses it for every declaration and every inference pass.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { ColumnName, ForeignKeyColumn } from '../catalog/types';
import type { PrototypeName, ResourceObjectMember } from './member-name';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * What lets camelCase give an invalid name, or a name another column also
 * gives, in a lowercase column: a leading or trailing `_`, `__`, `_` before
 * a digit, and `$`, the one character JSON:API reserves that a PostgreSQL
 * identifier may hold unquoted. A lowercase column without them is plain.
 * Two cases escape the test, and the runtime catches both: a character
 * only a quoted identifier holds, such as `.`, `-`, or a space (matching
 * every reserved character added about a tenth to the check time on the
 * real catalogs of SPEC 15.5), and a Unicode case mapping after `_` that gives
 * two plain columns one name (`a_ß` and `a_s_s` both give `aSS`).
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
 */
type UnplainColumn =
  | `_${string}`
  | `${string}_`
  | `${string}__${string}`
  | `${string}_${Digit}${string}`
  | `${string}$${string}`;

type ReservedName = ResourceObjectMember | PrototypeName;

/** Named, since it holds template literal types (`NotAMemberName` in `member-name.ts`). */
type RiskyName = UnplainColumn | ReservedName;

/**
 * `C` when its field name may fail or be shared. It reads the name alone,
 * so TypeScript computes it once per column name in the program.
 */
type FieldRisk<C extends string> =
  C extends Lowercase<C> ? (C extends RiskyName ? C : never) : C;

/**
 * A foreign-key column whose relationship name needs `as` or is reserved,
 * and a column `<base>` next to `<base>_id`, whose field name its
 * relationship name equals.
 */
type RelationshipRisk<
  TTableDef extends PublicTable,
  C extends string,
> = C extends `${infer TBase}_id`
  ? TBase extends '' | ReservedName
    ? C
    : TBase extends ColumnName<TTableDef>
      ? C | TBase
      : never
  : C;

/**
 * The columns whose derived name may fail or be shared, reading each column
 * as a field and each foreign-key column also as a relationship. It holds
 * the primary key when that is `id`, which no member can name.
 */
export type TableNameRisk<TTableDef extends PublicTable> =
  | { [C in ColumnName<TTableDef>]: FieldRisk<C> }[ColumnName<TTableDef>]
  | {
      [C in ForeignKeyColumn<TTableDef>]: RelationshipRisk<TTableDef, C>;
    }[ForeignKeyColumn<TTableDef>];
