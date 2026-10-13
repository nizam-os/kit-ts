/**
 * The names a declaration hands `@nizam-os/keyset-core` (SPEC 11.2): the
 * public name of each filtered or sortable member, which becomes a field
 * name, and the search configuration, which adapters emit as a literal.
 * `IsFieldName` and `IsSearchConfig` are the type-level twins of
 * keyset-core's `isFieldName` and `isSearchConfig`, pinned to them by one
 * case table (`test-support/keyset-name-cases.ts`). Each reads a name one
 * character at a time in tail position, so TypeScript computes it once
 * per name and a long name stays far below the instantiation depth limit.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/keyset/SPEC.md (sections 3 and 3.4)
 * @ref https://devblogs.microsoft.com/typescript/announcing-typescript-4-5/#tailrec-conditional
 * @packageDocumentation
 */

/** keyset-core's field and relation names, for messages (keyset SPEC 3). */
export const FIELD_NAME_SYNTAX = '^[A-Za-z0-9][A-Za-z0-9_-]*$';

/** keyset-core's text search configurations, the name syntax of a `regconfig` (keyset SPEC 3.4). */
export const SEARCH_CONFIG_SYNTAX = '^[a-z_][a-z0-9_]{0,62}$';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Lower =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';
type Alphanumeric = Lower | Uppercase<Lower> | Digit;

/** The names keyset-core refuses because their lookup reaches `Object.prototype` (keyset SPEC 2.3). */
type PrototypeKey = '__proto__' | 'constructor' | 'prototype';

type FieldNameTail<TName extends string> =
  TName extends `${infer THead}${infer TRest}`
    ? THead extends Alphanumeric | '_' | '-'
      ? FieldNameTail<TRest>
      : false
    : true;

/** Whether a literal name is a keyset-core field name; `true` for `string`, which the runtime checks. */
export type IsFieldName<TName extends string> = string extends TName
  ? true
  : TName extends PrototypeKey
    ? false
    : TName extends `${infer THead}${infer TRest}`
      ? THead extends Alphanumeric
        ? FieldNameTail<TRest>
        : false
      : false;

/** The characters a `regconfig` name may hold after its first: 63 in all, PostgreSQL's NAMEDATALEN less one. */
type ConfigTailLength = 62;

type ConfigTail<
  TName extends string,
  TCount extends ReadonlyArray<unknown>,
> = TName extends `${infer THead}${infer TRest}`
  ? THead extends Lower | Digit | '_'
    ? TCount['length'] extends ConfigTailLength
      ? false
      : ConfigTail<TRest, [...TCount, unknown]>
    : false
  : true;

/** Whether a literal name is a search configuration keyset-core accepts; `true` for `string`, which the runtime checks. */
export type IsSearchConfig<TName extends string> = string extends TName
  ? true
  : TName extends `${infer THead}${infer TRest}`
    ? THead extends Lower | '_'
      ? ConfigTail<TRest, []>
      : false
    : false;
