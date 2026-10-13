/**
 * The keys of a document's components (SPEC 13.1): `<type>.<suffix>` for a
 * resource's schemas, and `_error.<code>` for the error object of a code in
 * `components.schemas` and for its lone response in `components.responses`,
 * two maps with keys of their own. A component key holds only
 * `a-zA-Z0-9.-_`, while a type, a JSON:API member name, may also hold a
 * space and characters outside ASCII, and a code may be any string. So a
 * name is spelled with each UTF-16 code unit outside `A-Za-z0-9_-` as `.`
 * and four uppercase hexadecimal digits, which is injective over every
 * string, an unpaired surrogate included. A suffix is a lowercase word, or
 * two joined by `-`, after the last `.`, which never reads as an escape, and
 * an error key starts with `_`, which no type's spelling does: a member name
 * starts with a letter, a digit, or a character outside ASCII.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#components-object
 * @ref https://jsonapi.org/format/1.1/#document-member-names-allowed-characters
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';

/**
 * The schemas a resource has: the resource object, its identifier, and the
 * resource objects of a create and an update; with the Atomic Operations
 * endpoint, its local identifier and the resource objects of an `add` and
 * an `update` operation.
 */
export type SchemaSuffix =
  | 'resource'
  | 'identifier'
  | 'create'
  | 'update'
  | 'local'
  | 'atomic-add'
  | 'atomic-update';

/** One match per code point outside the kept characters; `escape` spells each of its code units. */
const ESCAPED = /[^A-Za-z0-9_-]/gu;
const HEX = 16;
const UNIT_DIGITS = 4;
const SCHEMAS = '#/components/schemas/';
const RESPONSES = '#/components/responses/';

function escape(match: string): string {
  let spelling = '';
  for (let index = 0; index < match.length; index += 1) {
    // oxlint-disable-next-line unicorn/prefer-code-point -- reason: the spelling escapes UTF-16 code units, so an unpaired surrogate has one of its own
    const unit = match.charCodeAt(index).toString(HEX).toUpperCase();
    spelling += `.${unit.padStart(UNIT_DIGITS, '0')}`;
  }
  return spelling;
}

/** `name` in the characters of a component key. */
function spelled(name: string): string {
  return name.replaceAll(ESCAPED, escape);
}

/** The key of a resource's schema in `components.schemas`. */
export function schemaKey(type: string, suffix: SchemaSuffix): string {
  return `${spelled(type)}.${suffix}`;
}

/** A reference to a resource's schema; `/` and `~` never occur in a key, so it needs no JSON Pointer escape. */
export function schemaRef(type: string, suffix: SchemaSuffix): JsonSchema {
  return { $ref: `${SCHEMAS}${schemaKey(type, suffix)}` };
}

/** The key of a code's error object in `components.schemas` and of its lone response in `components.responses`. */
export function errorKey(code: string): string {
  return `_error.${spelled(code)}`;
}

/** The reference `errorResponses` puts in place of a code's error object. */
export function errorRef(code: string): string {
  return `${SCHEMAS}${errorKey(code)}`;
}

/** The reference `errorResponses` puts in place of the response of a status that carries one code. */
export function errorResponseRef(code: string): string {
  return `${RESPONSES}${errorKey(code)}`;
}
