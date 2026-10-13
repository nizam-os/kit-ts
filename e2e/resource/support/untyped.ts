/**
 * The definer as JavaScript calls it, with its types erased, and the
 * message of the `TypeError` a call throws (resource SPEC 14).
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { declareResource } from '../resources/declare-resource.ts';

/** Calls `declareResource` as JavaScript does: no type checks any argument. */
export function declareUntyped(table: unknown, declaration: unknown): unknown {
  return Reflect.apply(declareResource, undefined, [table, declaration]);
}

/** Calls `createDeclareResource` as JavaScript does. */
export function configureUntyped(config: unknown): unknown {
  return Reflect.apply(createDeclareResource, undefined, [config]);
}

/** The message of the `TypeError` that `run` throws; any other outcome fails the test. */
export function typeErrorOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected a TypeError');
}
