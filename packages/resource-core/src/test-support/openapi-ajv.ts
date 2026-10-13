/**
 * JSON Schema validation for the OpenAPI tests (SPEC 13.1): one Ajv 2020-12
 * instance in strict mode with every format the document names, each
 * asserted: ajv-formats' `date`, `date-time`, `uuid`, `int32`, `int64`,
 * `float`, and `double`, plus `int16`, `decimal`, and `date-time-local` of
 * the OpenAPI format registry. Formats are only annotations in the OpenAPI
 * dialect; asserting them here proves the document never names a format
 * its values do not have. Not published with the package.
 * @ref https://spec.openapis.org/registry/format/
 * @ref https://ajv.js.org/json-schema.html#draft-2020-12
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';

import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;
/** A decimal literal in any spelling PostgreSQL reads for `numeric`. */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/u;
/** RFC 3339 `full-date "T" partial-time`, where `T` may be lower case (RFC 3339 5.6). */
const DATE_TIME_LOCAL =
  /^(\d{4})-(\d{2})-(\d{2})[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?$/u;

function isCalendarDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isDateTimeLocal(text: string): boolean {
  const match = DATE_TIME_LOCAL.exec(text);
  return (
    match !== null &&
    isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]))
  );
}

/** A strict Ajv instance with the document's formats; each call gets its own, so schemas with one `$id` never collide. */
export function openApiAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addFormat('int16', {
    type: 'number',
    validate: (value: number) =>
      Number.isInteger(value) && value >= INT16_MIN && value <= INT16_MAX,
  });
  ajv.addFormat('decimal', { type: 'string', validate: DECIMAL });
  ajv.addFormat('date-time-local', {
    type: 'string',
    validate: isDateTimeLocal,
  });
  return ajv;
}

const shared = openApiAjv();

/** Compiles `schema` on a shared instance; the schemas compiled here carry no `$id`. */
export function compileSchema(schema: JsonSchema): (value: unknown) => boolean {
  const validate = shared.compile(schema);
  return (value) => validate(value);
}
