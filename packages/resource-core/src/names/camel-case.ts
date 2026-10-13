/**
 * `CamelCase<TText>`, the type-level twin of `toCamelCase` from
 * `@nizam-os/catalog-core` under its default options (SPEC 4.1), pinned to
 * it by one case table (`test-support/camel-cases.ts`). The runtime keeps
 * the first character, drops every `_`, and upper-cases the character
 * after one; this keeps the first character and joins the `_`-separated
 * segments after it, capitalizing each segment that follows a `_`, which
 * is the same result in one step per segment instead of per character.
 * `Capitalize` upper-cases with `String.prototype.toUpperCase`, special
 * casings included (`ß` becomes `SS`), as the runtime does. TypeScript 7
 * upper-cases a whole code point where the runtime upper-cases one UTF-16
 * code unit, so the two differ only for a cased letter outside the Basic
 * Multilingual Plane after a `_`, which `deriveNames` refuses without
 * `as`. Each step is in tail position, so a long identifier stays far
 * below the instantiation depth limit.
 * @ref https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html#capitalizestringtype
 * @ref https://devblogs.microsoft.com/typescript/announcing-typescript-4-5/#tailrec-conditional
 * @packageDocumentation
 */

type CamelSegments<
  TText extends string,
  TOut extends string,
  TCapitalize extends boolean,
> = TText extends `${infer THead}_${infer TTail}`
  ? CamelSegments<
      TTail,
      `${TOut}${TCapitalize extends true ? Capitalize<THead> : THead}`,
      true
    >
  : `${TOut}${TCapitalize extends true ? Capitalize<TText> : TText}`;

/**
 * A name as `toCamelCase` from `@nizam-os/catalog-core` converts it with the
 * default options. A name without `_` is itself; a leading `_` is kept and
 * capitalizes the segment after it.
 */
export type CamelCase<TText extends string> =
  TText extends `${infer THead}_${infer TTail}`
    ? CamelSegments<TTail, THead extends '' ? '_' : THead, true>
    : TText;
