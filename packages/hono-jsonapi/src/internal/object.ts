/**
 * Own-property reads over values that came from a document, so a member
 * named `constructor` is a plain key and never a prototype walk. The same
 * two helpers as @nizam-os/jsonapi-core's internal module, which is not part of its
 * public surface.
 * @packageDocumentation
 */

/** A JSON object: a non-null, non-array object. */
export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property read that cannot reach the prototype chain. */
export function ownMember(record: JsonRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
