/**
 * The schema of each filter parameter (SPEC 11.2, 11.3, 13.1): the text
 * `@nizam-os/keyset-core` accepts for the member's keyset type (keyset SPEC
 * 4.3), one value per parameter; a list for `in`, `nin`, `between`, and an
 * array's operators, sent as the parameter repeated, which
 * `keysetRequest` reads as a list; `true` or `false` for `isNull`. The
 * patterns spell keyset-core's own in the regular expression tokens JSON
 * Schema recommends; the dates keyset-core checks against the calendar
 * are left to the server.
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/SPEC.md (sections 4.2 and 4.3)
 * @ref https://spec.openapis.org/oas/v3.1.2.html#style-values (form, exploded)
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';
import type {
  FieldInit,
  Operator,
  ScalarFieldType,
} from '@nizam-os/keyset-core';

const INTEGER = '^[+-]?[0-9]+$';
const DECIMAL = '[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)';
const CLOCK = '([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\\.[0-9]{1,6})?)?';
const TIMESTAMP = `^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]${CLOCK}(Z|[+-]([01][0-9]|2[0-3])(:?[0-5][0-9])?)?$`;
const BOOLEAN_TEXT: JsonSchema = Object.freeze({
  type: 'string',
  enum: ['true', 'false'],
});

/** Each keyset type's value text but `enum`'s, which its labels give. */
const TEXT_FORMS: Readonly<
  Record<Exclude<ScalarFieldType, 'enum'>, JsonSchema>
> = {
  text: { type: 'string' },
  integer: { type: 'string', pattern: INTEGER },
  bigint: { type: 'string', pattern: INTEGER },
  decimal: { type: 'string', pattern: `^${DECIMAL}$` },
  float: { type: 'string', pattern: `^${DECIMAL}([eE][+-]?[0-9]+)?$` },
  boolean: BOOLEAN_TEXT,
  uuid: { type: 'string', format: 'uuid' },
  date: { type: 'string', format: 'date' },
  time: { type: 'string', pattern: `^${CLOCK}$` },
  timestamp: { type: 'string', pattern: TIMESTAMP },
  timestamptz: { type: 'string', pattern: TIMESTAMP },
};

/** The operators whose value is a list; for an array field, every operator. */
const LIST_OPERATORS: ReadonlySet<Operator> = new Set(['in', 'nin', 'between']);

/** One value of `field`: its element's for an array. */
function valueSchema(field: FieldInit): JsonSchema {
  if (field.type === 'enum') {
    return { type: 'string', enum: [...field.values] };
  }
  return field.type === 'array' ? TEXT_FORMS[field.of] : TEXT_FORMS[field.type];
}

/** The schema of `filter[<member>][<operator>]` for a member whose keyset field is `field`. */
export function filterSchema(field: FieldInit, operator: Operator): JsonSchema {
  if (operator === 'isNull') {
    return BOOLEAN_TEXT;
  }
  if (operator === 'between') {
    return {
      type: 'array',
      items: valueSchema(field),
      minItems: 2,
      maxItems: 2,
    };
  }
  return field.type === 'array' || LIST_OPERATORS.has(operator)
    ? { type: 'array', items: valueSchema(field), minItems: 1 }
    : valueSchema(field);
}
