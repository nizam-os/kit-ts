/**
 * Reading a declared resource (resource SPEC 20.1): the members of what a
 * `declareResource` returned that the bindings read, and the `TypeError` of
 * an argument that is not one. resource-core knows its declarations by a
 * private brand, so the bindings check the members every declared resource
 * has; a JavaScript caller who hands anything else learns it at the call.
 * @packageDocumentation
 */
import type { FieldMeta, ResourceNames } from '@nizam-os/resource-core';

import { isObject } from './object';

/**
 * What the bindings read of a declared resource, and the constraint of
 * their type parameters that take one. `DeclaredResource` is the wrong
 * constraint: TypeScript relates its definer contexts invariantly and
 * recomputes the failed check at every reference (resource SPEC 15.5).
 */
export interface DeclaredShape {
  readonly names: ResourceNames;
  /** Each public field's and relationship's metadata, the fields and then the relationships (SPEC 8). */
  readonly fields: Readonly<Record<string, FieldMeta>>;
}

/** The members every declared resource has (SPEC 3); `in` reads none of them, so no lazy member is built here. */
const MEMBERS: ReadonlyArray<string> = [
  'names',
  'declaration',
  'fields',
  'write',
  'resource',
  'keyset',
];

/** Throws a `TypeError` naming `caller` when `resource` lacks a member every declared resource has. */
export function checkDeclared(caller: string, resource: unknown): void {
  if (!isObject(resource) || MEMBERS.some((member) => !(member in resource))) {
    throw new TypeError(
      `${caller}: resource must be what a declareResource returned`,
    );
  }
}
