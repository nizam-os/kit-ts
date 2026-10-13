/**
 * Kysely's CamelCasePlugin conversions, ported line by line from its
 * mappers (identical in Kysely 0.28 and 0.29): the plugin renames result
 * keys from snake_case to camelCase and turns every identifier of a query
 * back into snake_case. `@nizam-os/pg-catalog` names its `camelCase` Kysely
 * types with them, and `@nizam-os/resource-core` derives public field names
 * with `toCamelCase` under the default options, so both read one
 * implementation. Characters are read as UTF-16 code units, as the plugin
 * reads them. `@nizam-os/pg-catalog` holds the test that runs these against
 * the plugin itself, since a core imports no query builder.
 * @ref https://github.com/kysely-org/kysely/blob/v0.28.17/src/plugin/camel-case/camel-case.ts
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 * @packageDocumentation
 */

/**
 * The options of Kysely's `CamelCasePlugin` that change names; give the
 * ones the application gives the plugin.
 * @ref https://kysely-org.github.io/kysely-apidoc/interfaces/CamelCasePluginOptions.html
 */
export interface CamelCaseOptions {
  readonly upperCase?: boolean;
  readonly underscoreBeforeDigits?: boolean;
  readonly underscoreBetweenUppercaseLetters?: boolean;
}

const UNDERSCORE = '_';

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/** Whether the character at `index` is upper case and has a lower-case form, read as Kysely reads it. */
function isUpper(
  text: string,
  upper: string,
  lower: string,
  index: number,
): boolean {
  const character = upper.charAt(index);
  return text.charAt(index) === character && character !== lower.charAt(index);
}

/** CamelCasePlugin's `snakeCase`: what a query identifier becomes. */
export function toSnakeCase(
  text: string,
  options: CamelCaseOptions = {},
): string {
  if (text.length === 0) {
    return text;
  }
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  let out = lower.charAt(0);
  for (let index = 1; index < text.length; index += 1) {
    const character = text.charAt(index);
    const digitStart =
      isDigit(character) &&
      !isDigit(text.charAt(index - 1)) &&
      !out.endsWith(UNDERSCORE);
    if (options.underscoreBeforeDigits === true && digitStart) {
      out += `${UNDERSCORE}${character}`;
    } else if (isUpper(text, upper, lower, index)) {
      const afterUpper = isUpper(text, upper, lower, index - 1);
      const separate =
        options.underscoreBetweenUppercaseLetters === true || !afterUpper;
      out += `${separate ? UNDERSCORE : ''}${lower.charAt(index)}`;
    } else {
      out += character;
    }
  }
  return options.upperCase === true ? out.toUpperCase() : out;
}

/** Kysely tests UTF-16 units, skipping the first, for upper-case snake_case. */
function isUpperSnakeCase(text: string): boolean {
  for (let index = 1; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character !== UNDERSCORE && character !== character.toUpperCase()) {
      return false;
    }
  }
  return true;
}

/**
 * CamelCasePlugin's `camelCase`: what a result key becomes. Under the
 * default options the first character is kept, every `_` is dropped, and
 * the character after a `_` is upper-cased: `created_at` is `createdAt`.
 */
export function toCamelCase(
  text: string,
  options: CamelCaseOptions = {},
): string {
  if (text.length === 0) {
    return text;
  }
  const source =
    options.upperCase === true && isUpperSnakeCase(text)
      ? text.toLowerCase()
      : text;
  let out = source.charAt(0);
  for (let index = 1; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (character !== UNDERSCORE) {
      out +=
        source.charAt(index - 1) === UNDERSCORE
          ? character.toUpperCase()
          : character;
    }
  }
  return out;
}
