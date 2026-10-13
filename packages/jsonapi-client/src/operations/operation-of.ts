/**
 * `operationOf(error)` (SPEC 17.3): the operation an error object of a
 * refused Atomic Operations request points at. The extension asks a
 * server to point each error at "the source of the problem in the request
 * document", and an operation is `/atomic:operations/<index>`, its index
 * an RFC 6901 array index: `0`, or a digit from 1 to 9 followed by digits.
 * The rest of the pointer is what a single call's refusal would name, so
 * the screen that sent the operation reads it as it reads that call's.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-4 (`array-index = %x30 / ( %x31-39 *(%x30-39) )`)
 * @packageDocumentation
 */
import type { ErrorObject } from '@nizam-os/jsonapi-core';

import type { OperationPointer } from './types';

/** `/atomic:operations/<index>`, alone or followed by `/` and the rest, which may hold any character. */
const OPERATION_POINTER = /^\/atomic:operations\/(0|[1-9][0-9]*)(\/.*)?$/su;

/**
 * The index of the operation `error` points at and the pointer within
 * it, `''` for the operation itself; `undefined` for an error that points
 * at no operation, or at an index no list can hold.
 */
export function operationOf(error: ErrorObject): OperationPointer | undefined {
  const pointer = error.source?.pointer;
  const match = pointer === undefined ? null : OPERATION_POINTER.exec(pointer);
  if (match === null) {
    return undefined;
  }
  const index = Number(match[1]);
  return Number.isSafeInteger(index)
    ? { index, pointer: match[2] ?? '' }
    : undefined;
}
