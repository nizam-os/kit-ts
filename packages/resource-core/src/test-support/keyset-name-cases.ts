/**
 * The keyset name case tables (SPEC 11.2): a name and whether
 * `@nizam-os/keyset-core` accepts it as a field name, or as a search
 * configuration. keyset-core's `isFieldName` and `isSearchConfig`
 * (`jsonapi/keyset-names.test.ts`) and the type-level `IsFieldName` and
 * `IsSearchConfig` (`jsonapi/keyset-names.test-d.ts`) are held to them.
 * Not published with the package.
 * @packageDocumentation
 */

export const FIELD_NAME_CASES = [
  ['a', true],
  ['A', true],
  ['1', true],
  ['createdAt', true],
  ['first-name_2', true],
  ['a-', true],
  ['a_', true],
  ['', false],
  ['-a', false],
  ['_a', false],
  ['a b', false],
  ['a.b', false],
  ['a$b', false],
  ['größe', false],
  ['名前', false],
  ['😀', false],
  ['constructor', false],
  ['prototype', false],
  ['__proto__', false],
] as const;

export const SEARCH_CONFIG_CASES = [
  ['simple', true],
  ['english', true],
  ['_x', true],
  ['a1_b', true],
  ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true],
  ['', false],
  ['English', false],
  ['1english', false],
  ['pg_catalog.english', false],
  ["en'glish", false],
  ['a-b', false],
  ['a b', false],
  ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false],
] as const;
