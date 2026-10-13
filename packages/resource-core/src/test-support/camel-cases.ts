/**
 * The camelCase case table (SPEC 4.1, 4.3): a name and what Kysely
 * 0.29.6's `CamelCasePlugin` makes of it under the default options,
 * captured by running the plugin. `toCamelCase` of `@nizam-os/catalog-core`
 * (`names/camel-case.test.ts`) and the type-level `CamelCase`
 * (`names/camel-case.test-d.ts`) are both held to it. A cased letter
 * outside the Basic Multilingual Plane after `_` is absent on purpose:
 * there the two differ, and `deriveNames` refuses the column without `as`.
 * Not published with the package.
 * @packageDocumentation
 */

export const CAMEL_CASES = [
  ['', ''],
  ['x', 'x'],
  ['id', 'id'],
  ['created_at', 'createdAt'],
  ['organization_id', 'organizationId'],
  ['a_b_c', 'aBC'],
  ['user_id_hash', 'userIdHash'],
  ['a__b', 'aB'],
  ['a___b', 'aB'],
  ['_tmp', '_Tmp'],
  ['__tmp', '_Tmp'],
  ['_', '_'],
  ['__', '_'],
  ['a_', 'a'],
  ['trailing__', 'trailing'],
  ['Mixed Case', 'Mixed Case'],
  ['createdAt', 'createdAt'],
  ['HTTP_status', 'HTTPStatus'],
  ['address_line_1', 'addressLine1'],
  ['x_1', 'x1'],
  ['a_1b', 'a1b'],
  ['größe_in_cm', 'größeInCm'],
  ['straße_name', 'straßeName'],
  ['a_ß', 'aSS'],
  ['a_ǆ', 'aǄ'],
  ['a_ŉ', 'aʼN'],
  ['a_é', 'aÉ'],
  ['a_ı', 'aI'],
  ['a_ǰ', 'aJ̌'],
  ['a_ﬁ', 'aFI'],
  ['a-b_c', 'a-bC'],
  ['a_-b', 'a-b'],
  ['a_$', 'a$'],
  ['price$', 'price$'],
  ['body_text', 'bodyText'],
  ['𐐨_x', '𐐨X'],
  ['x_😀', 'x😀'],
  ['名前_の', '名前の'],
] as const;

/** Columns where `toCamelCase` and `CamelCase` differ: a cased letter outside the BMP follows `_`. */
export const DIVERGENT_COLUMNS = ['x_𐐨', '_𐐨', 'a_𐐨b'] as const;
